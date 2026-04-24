# Default Address Feature Implementation

## Overview
This feature allows clients to set a default address that is automatically sent to workers when an offer (bid) is accepted. After acceptance, the client can change the address one time only if needed.

## Database Changes

### New Migration File
**File:** `supabase/migrations/20260424194953_add_default_address_and_change_tracking.sql`

### Schema Changes

#### 1. **profiles table**
- Added column: `default_address_id UUID` (references addresses.id)
- Allows customers to designate one address as their default

#### 2. **job_requests table**
- Added column: `original_shared_address_id UUID` (references addresses.id)
  - Tracks the original default address shared when the bid was accepted
- Added column: `address_changed BOOLEAN DEFAULT false`
  - Tracks whether the customer has already changed the address once

### Database Triggers

#### 1. `validate_default_address()`
- **Table:** profiles
- **Event:** BEFORE UPDATE of default_address_id
- **Logic:**
  - Ensures default_address_id belongs to the user
  - Prevents setting other users' addresses as default

#### 2. `auto_share_default_address()`
- **Table:** job_requests
- **Event:** AFTER UPDATE of status
- **Logic:**
  - When a bid is accepted (status changes from pending → accepted)
  - Automatically shares the customer's default address with the worker
  - Stores both `shared_address_id` and `original_shared_address_id`
  - Only runs if no address has been manually shared yet

#### 3. `guard_address_change_limit()`
- **Table:** job_requests
- **Event:** BEFORE UPDATE on shared_address_id
- **Logic:**
  - Enforces one-time address change after acceptance
  - Only customer can change the address
  - Job must be in 'accepted' or 'completed' status
  - Prevents changes if `address_changed` is already true
  - Sets `address_changed = true` on first change

#### 4. Updated RLS Policy
- Updated "Assigned worker can view shared job address" policy
- Workers can now see both the current shared address and the original shared address
- Ensures workers retain access to address history

## Frontend Changes

### 1. **Profile.tsx** (`src/pages/Profile.tsx`)

**Changes:**
- Added tracking of `default_address_id` from the profiles table
- Load profile data to get the default address ID
- Updated "Make default" button:
  - Changes from setting `is_default` on addresses table to updating `default_address_id` in profiles
  - Shows "Default" badge when an address is selected as default
  - Button disabled while saving

**Key Methods:**
```typescript
const setDefault = async (id: string) => {
  // Updates profiles.default_address_id instead of addresses.is_default
  await supabase.from("profiles").update({ default_address_id: id }).eq("id", user.id);
}
```

### 2. **ShareAddressDialog.tsx** (`src/components/fixbud/ShareAddressDialog.tsx`)

**Changes:**
- Added prop: `addressChanged: boolean`
  - Tracks if the customer has already changed the address once
- Button behavior:
  - Disabled when `addressChanged` is true
  - Shows "Address changed" if address was already changed
  - Shows "Change address" if no change has been made yet
  - Shows "Share address" for initial share
- Dialog description updates to inform user about one-time change limit
- Shows message when user has already changed address once

**Key Updates:**
```typescript
// Button disabled and message shown after one change
<Button disabled={addressChanged}>
  {addressChanged ? "Address changed" : "Share address"}
</Button>
```

### 3. **CustomerDashboard.tsx** (`src/pages/dashboard/CustomerDashboard.tsx`)

**Changes:**
- Added `address_changed: boolean` to Job interface
- Passes `addressChanged` prop to ShareAddressDialog
- Now fetches address_changed status from database

## User Flow

### 1. **Initial Setup (Profile Page)**
```
1. Customer adds multiple addresses in profile
2. Customer selects one as "Make default"
3. This updates profiles.default_address_id
```

### 2. **Job Posting**
```
1. Customer posts a job (status: pending)
2. Job has no address shared yet
```

### 3. **Bid Acceptance**
```
1. Customer accepts a worker's bid
2. Database trigger auto_share_default_address fires:
   - Checks customer's default_address_id
   - Sets shared_address_id = default_address_id
   - Sets original_shared_address_id = default_address_id
   - Sets address_changed = false (no change has been made)
3. Worker can now see the shared address
```

### 4. **Address Change (Optional)**
```
1. Customer opens ShareAddressDialog for accepted job
2. ShareAddressDialog shows current shared address
3. If address_changed = false:
   - Customer can select a different address
   - Change is allowed
   - address_changed is set to true
4. If address_changed = true:
   - Button is disabled
   - Message explains no further changes allowed
   - Customer cannot modify address
```

## Technical Details

### Auto-Share Logic
The auto-share happens **automatically** via database trigger when a bid is accepted:
- No changes needed to BidsList.tsx or bid acceptance logic
- The trigger runs on the job status update
- Completely server-side, no UI involvement needed

### Address Change Validation
Server-side validation via trigger ensures:
- Only the job customer can change address
- Only possible after bid acceptance
- Only one change is allowed per job
- The new address must belong to the customer
- The database enforces these rules (client cannot bypass)

### RLS Policy Update
Workers can view:
- Current shared address (`shared_address_id`)
- Original shared address (`original_shared_address_id`)
- Only if they are the assigned worker
- Only if job is 'accepted' or 'completed'

## Testing Checklist

- [ ] Create a customer profile with multiple addresses
- [ ] Set one address as default
- [ ] Post a job as a customer
- [ ] Login as a worker and place a bid
- [ ] Accept the bid as customer
- [ ] Verify default address is auto-shared with worker
- [ ] Worker can see the shared address
- [ ] Customer can change address once from ShareAddressDialog
- [ ] Second change attempt is blocked
- [ ] Verify address_changed flag prevents further changes
- [ ] Delete an address that's the default - should be handled by database cascade

## Migration Instructions

1. Apply the migration: `supabase migration up` or deploy to Supabase
2. Update frontend components (Profile.tsx, ShareAddressDialog.tsx, CustomerDashboard.tsx)
3. Test the full workflow as described above

## Notes

- The old `is_default` field in addresses table is now deprecated (not used)
- Default address selection moved from addresses to profiles
- All validation is enforced at database level via triggers
- Address change tracking prevents accidental/malicious multiple changes
