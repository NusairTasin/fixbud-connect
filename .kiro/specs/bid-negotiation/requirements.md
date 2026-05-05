# Requirements Document

## Introduction

The bid negotiation feature extends FixBud's existing one-shot bidding system into a
multi-round negotiation flow. Currently a worker can place exactly one bid on a job and
the customer can only accept or ignore it. This feature allows the customer to reply with
a counter-offer, the worker to counter back, and so on until one party accepts the
outstanding offer — at which point the job is assigned and negotiation ends.

The change requires a new `bid_offers` table to store each round of the negotiation
thread, removal of the `UNIQUE (job_id, worker_id)` constraint from `bids` (or a
schema redesign that replaces it), updated database triggers and RLS policies, and
updated UI components for both the worker and customer dashboards.

---

## Glossary

- **Negotiation**: The back-and-forth exchange of monetary offers between a Customer and
  a Worker for a single Job, tracked as an ordered sequence of Offers.
- **Negotiation_Thread**: The complete ordered history of Offers for one (Job, Worker)
  pair. At most one Negotiation_Thread exists per (Job, Worker) pair.
- **Offer**: A single monetary proposal within a Negotiation_Thread, submitted by either
  the Customer or the Worker, with an optional explanatory message.
- **Active_Offer**: The most recent Offer in a Negotiation_Thread whose status is
  `pending`. Only one Active_Offer may exist per Negotiation_Thread at any time.
- **Proposer**: The authenticated user (Customer or Worker) who submits an Offer.
- **Responder**: The authenticated user who receives the Active_Offer and may accept,
  counter, or withdraw from the negotiation.
- **Worker**: A FixBud user with the `worker` app role who performs jobs.
- **Customer**: A FixBud user with the `customer` app role who posts jobs.
- **Job**: A `job_requests` row representing a service request posted by a Customer.
- **Negotiation_Service**: The backend layer (Supabase RLS + triggers) that enforces
  negotiation rules.
- **NegotiationThread_Component**: The React component that renders the full Offer
  history and action controls for one Negotiation_Thread.
- **BidDialog**: The existing React dialog used by Workers to initiate a bid; to be
  extended to open a Negotiation_Thread.
- **BidsList**: The existing React component used by Customers to view bids; to be
  replaced or extended with per-worker NegotiationThread_Components.

---

## Requirements

### Requirement 1: Initiate a Negotiation Thread

**User Story:** As a Worker, I want to start a negotiation on a Job by submitting an
initial offer, so that I can propose a price and begin a conversation with the Customer.

#### Acceptance Criteria

1. WHEN a Worker submits an initial offer on a pending, unassigned Job, THE
   Negotiation_Service SHALL create a new Negotiation_Thread for that (Job, Worker) pair
   and record the offer as the first Offer with `round_number = 1` and status `pending`.

2. IF a Negotiation_Thread already exists for the same (Job, Worker) pair, THEN THE
   Negotiation_Service SHALL reject the duplicate initiation attempt with an error.

3. WHEN a Worker submits an initial offer, THE Negotiation_Service SHALL enforce that
   the offer `amount` is a non-negative number with at most two decimal places.

4. IF the target Job status is not `pending` or the Job already has an assigned
   `worker_id`, THEN THE Negotiation_Service SHALL reject the offer with an error.

5. THE Negotiation_Service SHALL record the `proposer_role` as `worker` on the first
   Offer of every Negotiation_Thread.

---

### Requirement 2: Submit a Counter-Offer

**User Story:** As a Customer or Worker, I want to respond to the Active_Offer with a
counter-offer, so that I can propose a different price and continue the negotiation.

#### Acceptance Criteria

1. WHEN the Responder submits a counter-offer, THE Negotiation_Service SHALL set the
   previous Active_Offer status to `countered` and insert a new Offer with
   `round_number = previous_round + 1` and status `pending`.

2. IF the authenticated user is not the Responder for the current Active_Offer, THEN THE
   Negotiation_Service SHALL reject the counter-offer with an error.

3. IF no Active_Offer exists in the Negotiation_Thread (i.e., the thread is already
   resolved), THEN THE Negotiation_Service SHALL reject the counter-offer with an error.

4. WHEN a Customer submits a counter-offer, THE Negotiation_Service SHALL record the
   `proposer_role` as `customer` on the new Offer.

5. WHEN a Worker submits a counter-offer, THE Negotiation_Service SHALL record the
   `proposer_role` as `worker` on the new Offer.

6. THE Negotiation_Service SHALL enforce that each counter-offer `amount` is a
   non-negative number with at most two decimal places.

7. THE Negotiation_Service SHALL enforce that the Responder alternates with the
   Proposer: the `proposer_role` on the new Offer SHALL differ from the `proposer_role`
   on the previous Active_Offer.

---

### Requirement 3: Accept the Active Offer

**User Story:** As a Customer or Worker, I want to accept the current Active_Offer, so
that the negotiation concludes and the Job is assigned at the agreed price.

#### Acceptance Criteria

1. WHEN the Responder accepts the Active_Offer, THE Negotiation_Service SHALL set the
   Active_Offer status to `accepted`.

2. WHEN an Offer is accepted, THE Negotiation_Service SHALL update the corresponding Job
   `worker_id` to the Worker of the Negotiation_Thread and set the Job `status` to
   `accepted`.

3. WHEN an Offer is accepted, THE Negotiation_Service SHALL set all other `pending`
   Offers across all other Negotiation_Threads for the same Job to `rejected`.

4. IF the authenticated user is not the Responder for the Active_Offer, THEN THE
   Negotiation_Service SHALL reject the acceptance attempt with an error.

5. IF the Job is no longer in `pending` status at the time of acceptance, THEN THE
   Negotiation_Service SHALL reject the acceptance attempt with an error.

6. WHEN an Offer is accepted, THE Negotiation_Service SHALL record the accepted `amount`
   as the final agreed price accessible to both the Customer and the Worker.

---

### Requirement 4: Withdraw from a Negotiation

**User Story:** As a Worker, I want to withdraw my negotiation thread, so that I can
remove my offer if I am no longer interested in the Job.

#### Acceptance Criteria

1. WHEN a Worker withdraws from a Negotiation_Thread, THE Negotiation_Service SHALL set
   the Active_Offer status to `withdrawn` and mark the Negotiation_Thread as resolved.

2. IF the Negotiation_Thread has no Active_Offer (already resolved), THEN THE
   Negotiation_Service SHALL reject the withdrawal with an error.

3. IF the authenticated user is not the Worker of the Negotiation_Thread, THEN THE
   Negotiation_Service SHALL reject the withdrawal with an error.

4. WHEN a Worker withdraws, THE Negotiation_Service SHALL leave all other
   Negotiation_Threads for the same Job unaffected.

---

### Requirement 5: View the Negotiation Thread

**User Story:** As a Customer or Worker, I want to see the full history of offers in a
negotiation, so that I can understand how the price evolved and what the current
Active_Offer is.

#### Acceptance Criteria

1. WHEN a Customer views a Job, THE NegotiationThread_Component SHALL display all
   Negotiation_Threads for that Job, one per Worker, ordered by the Worker's first offer
   `created_at` ascending.

2. WHEN a Worker views a Job in the available jobs list, THE NegotiationThread_Component
   SHALL display only the Negotiation_Thread belonging to that Worker for that Job.

3. THE NegotiationThread_Component SHALL render each Offer in a thread in ascending
   `round_number` order, showing the `amount`, `proposer_role`, optional `message`, and
   `created_at` timestamp.

4. THE NegotiationThread_Component SHALL visually distinguish Offers proposed by the
   Customer from Offers proposed by the Worker (e.g., alignment or color).

5. THE NegotiationThread_Component SHALL clearly indicate the Active_Offer (the current
   pending offer awaiting a response).

6. WHEN the Negotiation_Thread is resolved (accepted, withdrawn, or all offers
   rejected), THE NegotiationThread_Component SHALL display the final status and the
   resolved amount.

---

### Requirement 6: Negotiation Action Controls

**User Story:** As a Customer or Worker, I want context-appropriate action buttons
within the negotiation thread, so that I can counter or accept without leaving the page.

#### Acceptance Criteria

1. WHEN it is the authenticated user's turn to respond (they are the Responder), THE
   NegotiationThread_Component SHALL display both an "Accept" button and a
   "Counter-offer" input for the Active_Offer.

2. WHEN it is not the authenticated user's turn (they are the Proposer of the
   Active_Offer), THE NegotiationThread_Component SHALL display a waiting indicator and
   SHALL NOT display action buttons.

3. WHEN a Worker is viewing a Job with no existing Negotiation_Thread, THE
   NegotiationThread_Component SHALL display the existing BidDialog trigger to initiate
   a new thread.

4. WHEN a Worker is viewing a Job with an existing Negotiation_Thread, THE
   NegotiationThread_Component SHALL display a "Withdraw" button if the thread has an
   Active_Offer.

5. WHEN a Customer is viewing a Job that has been accepted, THE
   NegotiationThread_Component SHALL NOT display any action buttons for that Job.

---

### Requirement 7: Real-time Updates

**User Story:** As a Customer or Worker, I want the negotiation thread to update
automatically when the other party submits an offer or accepts, so that I do not need to
refresh the page.

#### Acceptance Criteria

1. WHEN a new Offer is inserted into a Negotiation_Thread, THE
   NegotiationThread_Component SHALL reflect the new Offer within 3 seconds without a
   full page reload for all authenticated users currently viewing that thread.

2. WHEN an Offer status changes (e.g., `countered`, `accepted`, `withdrawn`), THE
   NegotiationThread_Component SHALL reflect the updated status within 3 seconds without
   a full page reload.

3. THE NegotiationThread_Component SHALL use the existing Supabase Realtime
   `postgres_changes` subscription mechanism already in use by the Customer and Worker
   dashboards.

---

### Requirement 8: Database Schema — Negotiation Offers Table

**User Story:** As a developer, I want a dedicated `bid_offers` table to store each
round of negotiation, so that the full history is preserved and the existing `bids`
table constraint issues are resolved.

#### Acceptance Criteria

1. THE Negotiation_Service SHALL store each Offer in a `bid_offers` table with columns:
   `id` (UUID PK), `bid_id` (FK → `bids.id`), `round_number` (integer ≥ 1),
   `proposer_role` (`customer` | `worker`), `amount` (NUMERIC(10,2) ≥ 0), `message`
   (TEXT nullable), `status` (`pending` | `countered` | `accepted` | `withdrawn` |
   `rejected`), `created_at` (TIMESTAMPTZ).

2. THE Negotiation_Service SHALL enforce a `UNIQUE (bid_id, round_number)` constraint on
   `bid_offers` to prevent duplicate rounds.

3. THE Negotiation_Service SHALL replace the `UNIQUE (job_id, worker_id)` constraint on
   `bids` with a partial unique index that allows at most one non-withdrawn
   Negotiation_Thread per (Job, Worker) pair.

4. THE Negotiation_Service SHALL remove or replace the `guard_bid_update` trigger
   restriction that prevents editing `amount` and `message`, since those fields now live
   on `bid_offers` rows rather than the parent `bids` row.

5. THE Negotiation_Service SHALL update the `handle_bid_accepted` trigger (or replace it
   with a new trigger on `bid_offers`) so that accepting an Offer correctly assigns the
   Job and rejects competing threads.

---

### Requirement 9: Row-Level Security for Negotiation

**User Story:** As a developer, I want RLS policies on `bid_offers` that enforce who can
read and write each offer, so that negotiation data is only accessible to the involved
parties.

#### Acceptance Criteria

1. THE Negotiation_Service SHALL allow a Worker to SELECT `bid_offers` rows only for
   Negotiation_Threads where `bids.worker_id = auth.uid()`.

2. THE Negotiation_Service SHALL allow a Customer to SELECT `bid_offers` rows only for
   Negotiation_Threads where the parent Job's `customer_id = auth.uid()`.

3. THE Negotiation_Service SHALL allow a Worker to INSERT a `bid_offers` row only when
   the `proposer_role = 'worker'` and it is the Worker's turn (the previous Offer in the
   thread was proposed by the Customer, or this is the first Offer).

4. THE Negotiation_Service SHALL allow a Customer to INSERT a `bid_offers` row only when
   the `proposer_role = 'customer'` and it is the Customer's turn (the previous Offer in
   the thread was proposed by the Worker).

5. THE Negotiation_Service SHALL deny UPDATE and DELETE on `bid_offers` rows to all
   roles; status transitions SHALL be performed exclusively by SECURITY DEFINER
   functions or triggers.

---

### Requirement 10: Negotiation Offer Round-Trip Integrity

**User Story:** As a developer, I want the negotiation state to be consistent and
recoverable from the `bid_offers` table alone, so that the UI can always reconstruct the
correct thread state.

#### Acceptance Criteria

1. FOR ALL Negotiation_Threads, THE Negotiation_Service SHALL ensure that at most one
   Offer per thread has status `pending` at any given time.

2. FOR ALL Negotiation_Threads, THE Negotiation_Service SHALL ensure that `round_number`
   values are contiguous starting from 1 with no gaps.

3. FOR ALL Negotiation_Threads, THE Negotiation_Service SHALL ensure that consecutive
   Offers alternate `proposer_role` values (no two adjacent rounds have the same
   proposer).

4. WHEN the Negotiation_Service serializes a Negotiation_Thread to JSON and deserializes
   it back, THE Negotiation_Service SHALL produce an equivalent thread state (round-trip
   property).
