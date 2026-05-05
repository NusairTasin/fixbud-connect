# Design Document — Bid Negotiation

## Overview

The bid negotiation feature extends FixBud's one-shot bidding system into a multi-round
counter-offer flow. Instead of a worker placing a single immutable bid that a customer
can only accept or ignore, both parties can now exchange counter-offers until one side
accepts the active offer — at which point the job is assigned and all competing threads
are closed.

The design introduces a `bid_offers` child table that stores every round of a
negotiation. The existing `bids` table is retained as the negotiation-thread header
(one row per worker per job), while `bid_offers` holds the ordered offer history. This
preserves backward compatibility with existing queries that read `bids` for status
information while adding the full round history.

Key design decisions:

- **`bids` as thread header, `bid_offers` as round log** — keeps the existing RLS
  surface on `bids` largely intact and avoids a full table rename.
- **SECURITY DEFINER functions for mutations** — counter-offer, accept, and withdraw
  are exposed as Postgres functions rather than direct INSERT/UPDATE, so the server
  enforces all invariants atomically without relying on client-side ordering.
- **Supabase Realtime on `bid_offers`** — the frontend subscribes to
  `postgres_changes` on `bid_offers` filtered by `bid_id`, giving sub-second updates
  without polling.
- **`NegotiationThread` React component** — a single component handles rendering and
  actions for one (job, worker) thread; it is composed into the existing
  `CustomerDashboard` and `WorkerDashboard` without replacing the surrounding page
  structure.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React + TypeScript)                                   │
│                                                                 │
│  CustomerDashboard          WorkerDashboard                     │
│       │                          │                             │
│  BidsList (replaced)        BidDialog (extended)               │
│       │                          │                             │
│  NegotiationThread ◄─────────────┘                             │
│  Component                                                      │
│       │  useNegotiationThread hook                              │
│       │  (load + realtime subscription)                         │
└───────┼─────────────────────────────────────────────────────────┘
        │ supabase-js
┌───────▼─────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│                                                                 │
│  RLS policies (SELECT)                                          │
│  ┌──────────┐   ┌────────────┐                                  │
│  │  bids    │──►│ bid_offers │                                  │
│  └──────────┘   └────────────┘                                  │
│                                                                 │
│  SECURITY DEFINER functions (mutations)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ negotiate_counter(bid_id, amount, message)               │   │
│  │ negotiate_accept(bid_id)                                 │   │
│  │ negotiate_withdraw(bid_id)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Triggers                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ on_bid_offer_accepted  (AFTER UPDATE on bid_offers)      │   │
│  │   → assigns job, rejects competing threads               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Realtime: postgres_changes on bid_offers                       │
└─────────────────────────────────────────────────────────────────┘
```

### Mutation flow

All state-changing operations go through SECURITY DEFINER RPC functions rather than
direct table writes. This ensures:

1. Atomicity — counter, accept, and withdraw each run in a single transaction.
2. Invariant enforcement — the function checks turn order, thread status, and job
   status before writing.
3. Minimal RLS surface — `bid_offers` has no UPDATE policy for regular users; only
   the SECURITY DEFINER functions can change offer status.

```
Worker/Customer UI
      │
      │ supabase.rpc('negotiate_counter' | 'negotiate_accept' | 'negotiate_withdraw')
      ▼
SECURITY DEFINER function
      │ validates caller, thread state, job state
      │ writes bid_offers row(s)
      ▼
Trigger: on_bid_offer_accepted (if accepted)
      │ updates job_requests, rejects other threads
      ▼
Realtime broadcast → all subscribers refresh
```

---

## Components and Interfaces

### Backend: Postgres functions

#### `negotiate_initiate(p_job_id UUID, p_amount NUMERIC, p_message TEXT) → UUID`

Creates the `bids` header row and the first `bid_offers` row (round 1, proposer_role =
`worker`). Returns the new `bid_id`. Replaces the direct `bids` INSERT from
`BidDialog`.

Preconditions checked inside the function:
- Caller has `worker` role.
- Caller has a location on their profile.
- Job exists, status = `pending`, `worker_id IS NULL`.
- No existing non-withdrawn `bids` row for this (job, worker) pair.
- Amount ≥ 0 with at most two decimal places.

#### `negotiate_counter(p_bid_id UUID, p_amount NUMERIC, p_message TEXT) → UUID`

Sets the current pending `bid_offers` row to `countered`, inserts a new row with
`round_number = max + 1`, `proposer_role` = caller's role, status = `pending`. Returns
the new offer UUID.

Preconditions:
- Caller is the responder (not the proposer of the active offer).
- Thread has exactly one pending offer.
- Job is still `pending`.
- Amount ≥ 0 with at most two decimal places.

#### `negotiate_accept(p_bid_id UUID) → VOID`

Sets the active `bid_offers` row to `accepted`. The `on_bid_offer_accepted` trigger
then assigns the job and rejects competing threads.

Preconditions:
- Caller is the responder.
- Thread has exactly one pending offer.
- Job is still `pending`.

#### `negotiate_withdraw(p_bid_id UUID) → VOID`

Sets the active `bid_offers` row to `withdrawn`. Only the worker of the thread may
call this.

Preconditions:
- Caller is the worker of the thread (`bids.worker_id = auth.uid()`).
- Thread has exactly one pending offer.

---

### Frontend: React components and hooks

#### `useNegotiationThread(bidId: string)`

Custom hook. Loads the full offer history for one `bid_id` and subscribes to
`postgres_changes` on `bid_offers` filtered by `bid_id=eq.{bidId}`. Returns:

```ts
interface UseNegotiationThreadResult {
  offers: BidOffer[];          // ascending round_number order
  loading: boolean;
  error: string | null;
  activeOffer: BidOffer | null; // the single pending offer, or null
  isMyTurn: boolean;            // true when auth.uid() is the responder
  counter: (amount: number, message?: string) => Promise<void>;
  accept: () => Promise<void>;
  withdraw: () => Promise<void>;
}
```

#### `NegotiationThread` component

Props:
```ts
interface NegotiationThreadProps {
  bidId: string;
  workerId: string;
  workerName: string;
  jobId: string;
  viewerRole: 'customer' | 'worker';
  onResolved?: () => void;   // called after accept/withdraw to refresh parent
}
```

Renders:
- Offer history timeline (ascending round order, visually distinguished by role).
- Active offer highlighted with "awaiting response" indicator.
- When `isMyTurn`: Accept button + Counter-offer form (amount input + optional message).
- When not `isMyTurn`: "Waiting for [other party]…" indicator.
- Withdraw button (worker only, when thread has an active offer).
- Resolved state: final status badge + agreed amount.

#### `BidDialog` (extended)

The existing `BidDialog` is updated to call `negotiate_initiate` via
`supabase.rpc(...)` instead of a direct `bids` INSERT. The UI is unchanged from the
worker's perspective — they still enter an amount and optional message.

#### `BidsList` (replaced)

`BidsList` is replaced by a list of `NegotiationThread` components, one per `bids`
row for the job. The customer sees all threads; each thread is collapsible.

---

## Data Models

### New enum: `offer_status`

```sql
CREATE TYPE public.offer_status AS ENUM (
  'pending',    -- active offer awaiting response
  'countered',  -- superseded by a counter-offer
  'accepted',   -- accepted; job assigned
  'withdrawn',  -- worker withdrew
  'rejected'    -- thread closed because another thread was accepted
);
```

### New enum: `proposer_role`

```sql
CREATE TYPE public.proposer_role AS ENUM ('customer', 'worker');
```

### New table: `bid_offers`

```sql
CREATE TABLE public.bid_offers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id        UUID          NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  round_number  INTEGER       NOT NULL CHECK (round_number >= 1),
  proposer_role public.proposer_role NOT NULL,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  message       TEXT,
  status        public.offer_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT bid_offers_unique_round UNIQUE (bid_id, round_number)
);

CREATE INDEX idx_bid_offers_bid    ON public.bid_offers(bid_id);
CREATE INDEX idx_bid_offers_status ON public.bid_offers(status);
```

### Modified table: `bids`

The `UNIQUE (job_id, worker_id)` constraint is replaced with a partial unique index
that allows at most one non-withdrawn thread per (job, worker) pair:

```sql
-- Drop old constraint
ALTER TABLE public.bids DROP CONSTRAINT IF EXISTS bids_job_id_worker_id_key;

-- Partial unique index: only one active (non-withdrawn) thread per (job, worker)
CREATE UNIQUE INDEX bids_active_thread_unique
  ON public.bids (job_id, worker_id)
  WHERE status NOT IN ('withdrawn');
```

The `amount` and `message` columns on `bids` become the initial offer snapshot (kept
for backward compatibility with existing queries) but are no longer the source of truth
for the current offer amount. The `guard_bid_update` trigger's amount/message
immutability checks are relaxed (those fields are no longer editable anyway since
mutations go through RPC functions).

### TypeScript types (to be added to `src/integrations/supabase/types.ts`)

```ts
export type OfferStatus = 'pending' | 'countered' | 'accepted' | 'withdrawn' | 'rejected';
export type ProposerRole = 'customer' | 'worker';

export interface BidOffer {
  id: string;
  bid_id: string;
  round_number: number;
  proposer_role: ProposerRole;
  amount: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
}

export interface NegotiationThread {
  bid_id: string;
  job_id: string;
  worker_id: string;
  worker_name: string;
  bid_status: string;   // bids.status
  offers: BidOffer[];   // ascending round_number
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid
executions of a system — essentially, a formal statement about what the system should
do. Properties serve as the bridge between human-readable specifications and
machine-verifiable correctness guarantees.*

### Property 1: Initial offer invariants

*For any* valid (job_id, worker_id, amount) tuple where the job is pending and
unassigned, calling `negotiate_initiate` SHALL produce exactly one `bid_offers` row
with `round_number = 1`, `status = 'pending'`, and `proposer_role = 'worker'`.

**Validates: Requirements 1.1, 1.5**

---

### Property 2: Duplicate thread rejection

*For any* (job, worker) pair that already has a non-withdrawn negotiation thread, a
second call to `negotiate_initiate` SHALL be rejected with an error and the existing
thread SHALL remain unchanged.

**Validates: Requirements 1.2**

---

### Property 3: Amount validation

*For any* offer amount that is negative or has more than two decimal places, the
Negotiation_Service SHALL reject the offer with an error; *for any* amount that is
non-negative with at most two decimal places, the service SHALL accept it.

**Validates: Requirements 1.3, 2.6**

---

### Property 4: Counter-offer advances round number

*For any* negotiation thread with an active offer at round N, a valid counter-offer
SHALL produce a new offer with `round_number = N + 1`, `status = 'pending'`, and the
previous offer's status SHALL be `'countered'`.

**Validates: Requirements 2.1**

---

### Property 5: Turn enforcement

*For any* negotiation thread with an active offer, the user who is the proposer of
that active offer SHALL be rejected when attempting to counter or accept it; only the
responder SHALL succeed.

**Validates: Requirements 2.2, 3.4**

---

### Property 6: Alternating proposer roles

*For any* negotiation thread with two or more offers, no two consecutive offers (by
`round_number`) SHALL share the same `proposer_role`.

**Validates: Requirements 2.7, 10.3**

---

### Property 7: Acceptance assigns job and closes competing threads

*For any* negotiation thread where the responder calls `negotiate_accept`, the
corresponding job SHALL have `worker_id` set to the thread's worker and `status =
'accepted'`, and all `bid_offers` rows with `status = 'pending'` in other threads for
the same job SHALL be set to `'rejected'`.

**Validates: Requirements 3.1, 3.2, 3.3**

---

### Property 8: Withdrawal isolates the thread

*For any* negotiation thread where the worker calls `negotiate_withdraw`, the active
offer SHALL be set to `'withdrawn'` and all other threads for the same job SHALL be
unaffected (their offer statuses unchanged).

**Validates: Requirements 4.1, 4.4**

---

### Property 9: At most one pending offer per thread

*For any* negotiation thread, at any point in time, the count of `bid_offers` rows
with `status = 'pending'` SHALL be at most 1.

**Validates: Requirements 10.1**

---

### Property 10: Contiguous round numbers

*For any* negotiation thread, the set of `round_number` values SHALL form a
contiguous sequence starting at 1 with no gaps (i.e., {1, 2, 3, …, N} for a thread
with N offers).

**Validates: Requirements 10.2**

---

### Property 11: Thread serialization round-trip

*For any* valid `NegotiationThread` object (with any number of offers in any terminal
or active state), serializing it to JSON and deserializing it back SHALL produce an
object that is deeply equal to the original.

**Validates: Requirements 10.4**

---

## Error Handling

### Database layer

All SECURITY DEFINER functions use `RAISE EXCEPTION` with descriptive messages for
every precondition failure. The Supabase client surfaces these as `PostgrestError`
objects with the message in `error.message`.

| Condition | Error message |
|---|---|
| Duplicate thread initiation | `'A negotiation thread already exists for this job and worker'` |
| Invalid amount | `'Offer amount must be a non-negative number with at most two decimal places'` |
| Job not pending | `'Job is no longer accepting offers'` |
| Not the responder | `'It is not your turn to respond'` |
| No active offer | `'This negotiation thread has no active offer'` |
| Not the worker (withdraw) | `'Only the worker can withdraw from a negotiation'` |

### Frontend layer

The `useNegotiationThread` hook catches all Supabase errors and:
1. Sets `error` state for display in the component.
2. Calls `toast.error(error.message)` via `sonner` (consistent with existing
   dashboard error handling).
3. Does not swallow errors silently.

Optimistic updates are **not** used — the hook waits for the RPC to resolve before
refreshing the offer list. This avoids inconsistent UI state on concurrent updates.

### Realtime disconnection

If the Supabase Realtime channel disconnects, the hook falls back to a manual reload
triggered by the next user action (counter/accept/withdraw). A reconnect handler calls
`load()` when the channel status returns to `SUBSCRIBED`.

---

## Testing Strategy

### Unit tests (Vitest)

Focus on pure logic that does not require a database:

- `getActiveOffer(offers: BidOffer[]): BidOffer | null` — returns the single pending
  offer or null.
- `isMyTurn(activeOffer: BidOffer | null, viewerRole: ProposerRole): boolean` —
  returns true when the viewer is the responder.
- `validateOfferAmount(amount: number): boolean` — returns true for valid amounts.
- `sortOffersByRound(offers: BidOffer[]): BidOffer[]` — returns offers in ascending
  round order.
- `NegotiationThread` component rendering — snapshot tests for each state (no thread,
  active offer / my turn, active offer / waiting, resolved).

### Property-based tests (Vitest + fast-check)

Property-based testing is appropriate here because the negotiation logic involves pure
functions over structured data (offer arrays, thread state) where input variation
(different round counts, role sequences, amounts) reveals edge cases that example tests
miss.

Each property test runs a minimum of 100 iterations.

**Library**: `fast-check` (already compatible with Vitest; install with
`npm install --save-dev fast-check`).

Tag format: `// Feature: bid-negotiation, Property {N}: {property_text}`

**Property 1 test** — `negotiate_initiate` produces round_number=1, status=pending,
proposer_role=worker. Generate random valid amounts and verify the returned offer row.

**Property 3 test** — Amount validation. Generate arbitrary numbers; verify that
amounts with >2 decimal places or negative values are rejected, and valid amounts are
accepted. Uses `fc.float()` and `fc.integer()` generators.

**Property 4 test** — Counter-offer advances round. Generate a thread with N active
rounds (N ∈ [1, 10]), counter, verify new round = N+1 and previous = countered.

**Property 5 test** — Turn enforcement. Generate threads with varying round counts;
verify the proposer of the active offer cannot counter or accept.

**Property 6 test** — Alternating roles. Generate sequences of counter-offers of
length 1–20; verify no two consecutive offers share the same proposer_role.

**Property 9 test** — At most one pending offer. After any sequence of operations on
a thread, count pending offers and assert ≤ 1.

**Property 10 test** — Contiguous rounds. Generate threads with N offers; verify
round numbers are exactly {1, 2, …, N}.

**Property 11 test** — JSON round-trip. Generate arbitrary `NegotiationThread`
objects using `fc.record(...)` with all fields; verify `JSON.parse(JSON.stringify(t))`
deep-equals the original.

### Integration tests

These verify the database layer end-to-end and are run against a local Supabase
instance (`supabase start`):

- Calling `negotiate_initiate` twice for the same (job, worker) returns an error on
  the second call.
- Calling `negotiate_accept` assigns the job and rejects competing threads (1–2
  examples with 2–3 competing threads).
- RLS: a worker cannot read `bid_offers` rows belonging to another worker's thread.
- RLS: a customer cannot read `bid_offers` rows for jobs they do not own.

### Migration smoke test

A single test verifies that the `bid_offers` table exists with the expected columns
and constraints after the migration is applied.
