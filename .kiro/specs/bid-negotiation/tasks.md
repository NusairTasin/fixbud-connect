# Implementation Plan: Bid Negotiation

## Overview

Extend FixBud's one-shot bidding system into a multi-round counter-offer flow. The
implementation proceeds in four phases: (1) database schema and backend functions,
(2) TypeScript types and pure utility logic, (3) the `useNegotiationThread` hook and
`NegotiationThread` component, and (4) wiring the new component into the existing
dashboards while retiring the old direct-insert paths.

## Tasks

- [x] 1. Database migration — schema additions
  - Create a new Supabase migration file under `supabase/migrations/`
  - Add `offer_status` enum: `pending`, `countered`, `accepted`, `withdrawn`, `rejected`
  - Add `proposer_role` enum: `customer`, `worker`
  - Create `bid_offers` table with columns `id`, `bid_id` (FK → `bids.id` ON DELETE CASCADE), `round_number` (integer ≥ 1), `proposer_role`, `amount` (NUMERIC(10,2) ≥ 0), `message` (TEXT nullable), `status` (offer_status DEFAULT 'pending'), `created_at`
  - Add `UNIQUE (bid_id, round_number)` constraint and indexes on `bid_id` and `status`
  - Drop the `UNIQUE (job_id, worker_id)` constraint from `bids` and replace it with a partial unique index `bids_active_thread_unique` on `(job_id, worker_id) WHERE status NOT IN ('withdrawn')`
  - Relax the `guard_bid_update` trigger: remove the immutability checks for `amount` and `message` (those fields now live on `bid_offers`)
  - Enable RLS on `bid_offers`
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 2. Database migration — RLS policies for `bid_offers`
  - Add SELECT policy: workers may read rows where `bids.worker_id = auth.uid()`
  - Add SELECT policy: customers may read rows where the parent job's `customer_id = auth.uid()`
  - Add INSERT policy: workers may insert when `proposer_role = 'worker'` and it is their turn
  - Add INSERT policy: customers may insert when `proposer_role = 'customer'` and it is their turn
  - Deny UPDATE and DELETE to all regular roles (mutations go through SECURITY DEFINER functions only)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 3. Database migration — SECURITY DEFINER functions and trigger
  - Implement `negotiate_initiate(p_job_id UUID, p_amount NUMERIC, p_message TEXT) → UUID`
    - Validates caller has `worker` role, caller has a location, job is pending and unassigned, no existing non-withdrawn thread for (job, worker), amount ≥ 0 with ≤ 2 decimal places
    - Inserts `bids` header row and first `bid_offers` row (round 1, proposer_role = 'worker', status = 'pending')
    - Returns the new `bid_id`
  - Implement `negotiate_counter(p_bid_id UUID, p_amount NUMERIC, p_message TEXT) → UUID`
    - Validates caller is the responder, exactly one pending offer exists, job is still pending, amount valid
    - Sets current pending offer to `countered`, inserts new offer with `round_number = max + 1`
    - Returns the new offer UUID
  - Implement `negotiate_accept(p_bid_id UUID) → VOID`
    - Validates caller is the responder, exactly one pending offer exists, job is still pending
    - Sets active offer to `accepted`
  - Implement `negotiate_withdraw(p_bid_id UUID) → VOID`
    - Validates caller is the worker of the thread, exactly one pending offer exists
    - Sets active offer to `withdrawn`
  - Implement trigger function `on_bid_offer_accepted` (AFTER UPDATE on `bid_offers`)
    - When `NEW.status = 'accepted'`: updates `job_requests` to set `worker_id` and `status = 'accepted'`; sets all other pending `bid_offers` rows for the same job to `rejected`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 8.5_

- [x] 4. Checkpoint — verify migration
  - Ensure the migration file is syntactically valid SQL (run `supabase db lint` or apply locally with `supabase db reset`)
  - Confirm `bid_offers` table exists with expected columns and constraints
  - Confirm all four RPC functions are registered in the database
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. TypeScript types and utility functions
  - [x] 5.1 Add `BidOffer`, `OfferStatus`, `ProposerRole`, and `NegotiationThread` types to `src/integrations/supabase/types.ts`
    - Add `offer_status` and `proposer_role` to the `Enums` section
    - Add `bid_offers` table Row/Insert/Update shapes to the `Tables` section
    - Export `OfferStatus`, `ProposerRole`, `BidOffer`, and `NegotiationThread` interfaces
    - _Requirements: 8.1_

  - [x] 5.2 Create `src/lib/negotiation.ts` with pure utility functions
    - `getActiveOffer(offers: BidOffer[]): BidOffer | null` — returns the single pending offer or null
    - `isMyTurn(activeOffer: BidOffer | null, viewerRole: ProposerRole): boolean` — true when viewer is the responder
    - `validateOfferAmount(amount: number): boolean` — true for non-negative amounts with ≤ 2 decimal places
    - `sortOffersByRound(offers: BidOffer[]): BidOffer[]` — ascending round_number order
    - _Requirements: 10.1, 10.3_

  - [ ]* 5.3 Write unit tests for utility functions in `src/lib/negotiation.test.ts`
    - Test `getActiveOffer` with empty array, single pending, multiple offers with one pending, all resolved
    - Test `isMyTurn` for both roles and null active offer
    - Test `validateOfferAmount` with negative, zero, valid decimals, >2 decimal places
    - Test `sortOffersByRound` with unsorted and already-sorted inputs
    - _Requirements: 10.1, 10.3_

  - [ ]* 5.4 Write property test for amount validation (Property 3)
    - **Property 3: Amount validation**
    - **Validates: Requirements 1.3, 2.6**
    - Install `fast-check` as a dev dependency: `npm install --save-dev fast-check`
    - Use `fc.float()` and `fc.integer()` generators to verify that amounts with >2 decimal places or negative values return `false`, and valid amounts return `true`
    - Tag: `// Feature: bid-negotiation, Property 3: Amount validation`

  - [ ]* 5.5 Write property test for alternating proposer roles (Property 6)
    - **Property 6: Alternating proposer roles**
    - **Validates: Requirements 2.7, 10.3**
    - Generate sequences of 1–20 counter-offers; verify no two consecutive offers share the same `proposer_role`
    - Tag: `// Feature: bid-negotiation, Property 6: Alternating proposer roles`

  - [ ]* 5.6 Write property test for contiguous round numbers (Property 10)
    - **Property 10: Contiguous round numbers**
    - **Validates: Requirements 10.2**
    - Generate threads with N offers; verify round numbers are exactly {1, 2, …, N}
    - Tag: `// Feature: bid-negotiation, Property 10: Contiguous round numbers`

  - [ ]* 5.7 Write property test for JSON round-trip (Property 11)
    - **Property 11: Thread serialization round-trip**
    - **Validates: Requirements 10.4**
    - Use `fc.record(...)` to generate arbitrary `NegotiationThread` objects; verify `JSON.parse(JSON.stringify(t))` deep-equals the original
    - Tag: `// Feature: bid-negotiation, Property 11: Thread serialization round-trip`

- [x] 6. `useNegotiationThread` hook
  - Create `src/hooks/useNegotiationThread.ts`
  - On mount, query `bid_offers` filtered by `bid_id` ordered by `round_number` ascending
  - Subscribe to `postgres_changes` on `bid_offers` with filter `bid_id=eq.{bidId}`; call `load()` on INSERT or UPDATE events
  - On channel reconnect (status returns to `SUBSCRIBED`), call `load()` to recover from disconnection
  - Expose `offers`, `loading`, `error`, `activeOffer`, `isMyTurn`, `counter`, `accept`, `withdraw`
  - `counter(amount, message?)` calls `supabase.rpc('negotiate_counter', ...)`, then reloads
  - `accept()` calls `supabase.rpc('negotiate_accept', ...)`, then reloads and calls `onResolved`
  - `withdraw()` calls `supabase.rpc('negotiate_withdraw', ...)`, then reloads and calls `onResolved`
  - On any RPC error: set `error` state and call `toast.error(error.message)`
  - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.1 Write unit tests for `useNegotiationThread` hook
    - Mock `supabase` client; test loading state, error state, and that RPC calls are made with correct arguments
    - _Requirements: 7.1, 7.2_

  - [ ]* 6.2 Write property test for at-most-one-pending invariant (Property 9)
    - **Property 9: At most one pending offer per thread**
    - **Validates: Requirements 10.1**
    - After any sequence of simulated operations on a thread, count pending offers and assert ≤ 1
    - Tag: `// Feature: bid-negotiation, Property 9: At most one pending offer per thread`

- [x] 7. `NegotiationThread` component
  - Create `src/components/fixbud/NegotiationThread.tsx`
  - Accept props: `bidId`, `workerId`, `workerName`, `jobId`, `viewerRole`, `onResolved?`
  - Use `useNegotiationThread` hook internally
  - Render offer history timeline in ascending round order; visually distinguish customer vs worker offers (alignment or color)
  - Highlight the active (pending) offer with an "awaiting response" indicator
  - When `isMyTurn`: render Accept button and counter-offer form (amount input + optional message textarea)
  - When not `isMyTurn`: render "Waiting for [other party]…" indicator; no action buttons
  - Render Withdraw button for workers when thread has an active offer
  - Render resolved state: final status badge + agreed amount when thread is resolved
  - Show loading spinner while `loading` is true; show error message when `error` is set
  - _Requirements: 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.4_

  - [ ]* 7.1 Write snapshot/rendering unit tests for `NegotiationThread`
    - Test rendering with no offers (empty thread)
    - Test rendering with active offer where `isMyTurn = true` (shows Accept + counter form)
    - Test rendering with active offer where `isMyTurn = false` (shows waiting indicator)
    - Test rendering with resolved thread (accepted, withdrawn, rejected states)
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 6.1, 6.2_

  - [ ]* 7.2 Write property test for turn enforcement (Property 5)
    - **Property 5: Turn enforcement**
    - **Validates: Requirements 2.2, 3.4**
    - Generate threads with varying round counts; verify `isMyTurn` returns false for the proposer of the active offer and true for the responder
    - Tag: `// Feature: bid-negotiation, Property 5: Turn enforcement`

  - [ ]* 7.3 Write property test for counter-offer round advancement (Property 4)
    - **Property 4: Counter-offer advances round number**
    - **Validates: Requirements 2.1**
    - Generate a thread with N active rounds (N ∈ [1, 10]); simulate counter; verify new round = N+1 and previous offer status = 'countered'
    - Tag: `// Feature: bid-negotiation, Property 4: Counter-offer advances round number`

- [x] 8. Checkpoint — verify component and hook in isolation
  - Run `npx vitest --run` to confirm all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update `BidDialog` to use `negotiate_initiate` RPC
  - Modify `src/components/fixbud/BidDialog.tsx`
  - Replace the direct `supabase.from('bids').insert(...)` call with `supabase.rpc('negotiate_initiate', { p_job_id, p_amount, p_message })`
  - Keep the existing UI (amount input, message textarea, submit button) unchanged
  - On success, call `onPlaced?.()` as before
  - On error, call `toast.error(error.message)` as before
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [ ]* 9.1 Write property test for initial offer invariants (Property 1)
    - **Property 1: Initial offer invariants**
    - **Validates: Requirements 1.1, 1.5**
    - Generate random valid amounts; verify the returned offer row has `round_number = 1`, `status = 'pending'`, `proposer_role = 'worker'`
    - Tag: `// Feature: bid-negotiation, Property 1: Initial offer invariants`

  - [ ]* 9.2 Write property test for duplicate thread rejection (Property 2)
    - **Property 2: Duplicate thread rejection**
    - **Validates: Requirements 1.2**
    - Simulate calling `negotiate_initiate` twice for the same (job, worker); verify the second call is rejected and the first thread is unchanged
    - Tag: `// Feature: bid-negotiation, Property 2: Duplicate thread rejection`

- [x] 10. Replace `BidsList` with `NegotiationThread` list in `CustomerDashboard`
  - Modify `src/pages/dashboard/CustomerDashboard.tsx`
  - Replace the `<BidsList jobId={j.id} canAccept onAccepted={load} />` usage inside the collapsible with a list of `<NegotiationThread>` components, one per `bids` row for the job
  - Fetch `bids` rows for each pending job (id, worker_id, status) to build the thread list; join worker name from profiles
  - Pass `viewerRole="customer"` and `onResolved={load}` to each `NegotiationThread`
  - Keep the collapsible wrapper and bid count badge
  - Do not display action buttons for jobs that are no longer pending (Requirement 6.5)
  - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.5_

- [x] 11. Integrate `NegotiationThread` into `WorkerDashboard`
  - Modify `src/pages/dashboard/WorkerDashboard.tsx`
  - In the "browse" job card, when `myBids[j.id]` exists (worker has a thread), render a `<NegotiationThread>` component instead of the "Bid placed" disabled button
  - Pass `viewerRole="worker"`, `bidId={myBids[j.id].id}`, `workerId={user.id}`, `workerName` from profile, `jobId={j.id}`, `onResolved={load}`
  - Keep the existing `BidDialog` trigger for jobs where the worker has no thread yet
  - Keep the "Accept at budget" button for jobs with no existing thread
  - Add `bid_id` to the `MyBid` interface so it is available for the `NegotiationThread` props
  - Update the `bids` query in `load()` to also select `id` (the bid UUID) in addition to `job_id`, `amount`, `status`
  - _Requirements: 5.2, 6.1, 6.2, 6.3, 6.4_

- [x] 12. Add Realtime subscription for `bid_offers` to dashboards
  - In `CustomerDashboard`, extend the existing Supabase Realtime channel to also subscribe to `postgres_changes` on `bid_offers` (no filter needed — RLS restricts visibility)
  - In `WorkerDashboard`, extend the existing channel to subscribe to `postgres_changes` on `bid_offers` (the `useNegotiationThread` hook handles per-thread subscriptions, but the dashboard-level subscription ensures the thread list refreshes when new threads appear)
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 13. Final checkpoint — end-to-end wiring
  - Run `npx vitest --run` to confirm all tests still pass after dashboard integration
  - Verify TypeScript compiles without errors: `npx tsc --noEmit`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at natural boundaries
- Property tests validate universal correctness properties using `fast-check`
- Unit tests validate specific examples and edge cases
- The `BidsList` component is superseded by `NegotiationThread` but can be kept in the codebase until the dashboard wiring (task 10) is complete
