# Quick Start: Deploy Default Address Feature

## TL;DR - 3 Steps to Deploy

### 1️⃣ Apply Database Migration (5 minutes)

**Using Supabase CLI:**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Using Supabase Dashboard:**
- Go to SQL Editor at https://app.supabase.com
- Create new query
- Copy & paste contents of `supabase/migrations/20260424194953_add_default_address_and_change_tracking.sql`
- Click Run

### 2️⃣ Deploy Frontend Code

```bash
git add .
git commit -m "feat: add default address feature with one-time change limit"
git push origin main
```

### 3️⃣ Test It Works

1. Go to Profile page in your app
2. Add an address (if you don't have one)
3. Click **"Make default"** button
4. Should show "Default" badge
5. Post a job, accept a bid → address auto-shared ✓
6. Try changing address → works once, blocked second time ✓

---

## What Was Changed

| File | Changes |
|------|---------|
| `supabase/migrations/20260424194953_...sql` | Added columns and triggers for default address feature |
| `src/pages/Profile.tsx` | Support for selecting default address |
| `src/components/fixbud/ShareAddressDialog.tsx` | One-time address change limit UI |
| `src/pages/dashboard/CustomerDashboard.tsx` | Pass address_changed status to dialog |

---

## Database Schema

**New Columns:**
- `profiles.default_address_id` → UUID reference to customer's default address
- `job_requests.address_changed` → Boolean, prevents multiple changes
- `job_requests.original_shared_address_id` → Tracks what was originally shared

**New Triggers:**
1. ✅ Auto-share default address when bid accepted
2. ✅ Enforce one-time address change limit  
3. ✅ Validate address ownership

---

## User Flow

```
1. Customer sets default address in Profile
                     ↓
2. Worker places bid on job
                     ↓
3. Customer accepts bid
                     ↓
4. ⚡ DATABASE TRIGGER FIRES
   - Auto-shares customer's default address with worker
                     ↓
5. Worker sees shared address in dashboard
                     ↓
6. Customer can change address ONCE if needed
                     ↓
7. After 1 change, button disabled forever
```

---

## Error Handling

**If you see "Could not find default_address_id column":**
- Migration hasn't been applied yet
- Run Step 1️⃣ above
- Wait 30 seconds for Supabase to sync
- Refresh page

Frontend gracefully falls back until migration is applied.

---

## Docs Reference

- 📖 `DEFAULT_ADDRESS_FEATURE.md` - Full feature documentation
- 📖 `SETUP_DEFAULT_ADDRESS.md` - Detailed setup guide
- 🛠️ `supabase/migrations/20260424194953_...sql` - Migration SQL

---

## Rollback (if needed)

```bash
# Reset to previous state
supabase db reset

# Or manually run the rollback SQL in supabase/migrations/20260424194953_...sql 
# (see ROLLBACK section in SETUP_DEFAULT_ADDRESS.md)
```

---

## Questions?

Check `SETUP_DEFAULT_ADDRESS.md` for:
- Detailed troubleshooting
- Testing checklist
- Verification steps
- Support contacts
