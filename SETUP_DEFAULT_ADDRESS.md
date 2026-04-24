# Default Address Feature - Setup & Deployment Guide

## Overview
This guide explains how to deploy the default address feature to your FixBud Connect application.

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20260424194953_add_default_address_and_change_tracking.sql`

This migration adds:
- `profiles.default_address_id` - Stores customer's default address
- `job_requests.original_shared_address_id` - Tracks original shared address
- `job_requests.address_changed` - Prevents multiple address changes
- Smart triggers for auto-sharing and validation

### 2. Frontend Components Updated

#### `src/pages/Profile.tsx`
- Added support for `default_address_id` from profiles table
- Changed "Make default" button to update profiles.default_address_id
- Graceful fallback if migration not yet applied
- Shows current default address with badge

#### `src/components/fixbud/ShareAddressDialog.tsx`
- Added `addressChanged` prop to track if address was already changed once
- Disables button and shows message after one change
- Handles migration not applied yet

#### `src/pages/dashboard/CustomerDashboard.tsx`
- Fetches `address_changed` status from database
- Passes it to ShareAddressDialog with fallback to false

## Deployment Steps

### Step 1: Apply Database Migration

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# List your projects
supabase projects list

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

#### Option B: Manual SQL in Supabase Dashboard

1. Go to https://app.supabase.com
2. Select your project
3. Go to SQL Editor
4. Create a new query
5. Copy contents of `supabase/migrations/20260424194953_add_default_address_and_change_tracking.sql`
6. Run it

#### Option C: Using Migrations in supabase folder

If your project has local Supabase setup:

```bash
cd /path/to/fixbud-connect
supabase db push
```

### Step 2: Deploy Frontend Code

Push the updated frontend code:

```bash
# Commit and push changes
git add .
git commit -m "feat: add default address selection and one-time change limit"
git push origin main

# Or deploy directly if using Vercel/Netlify
npm run build
# Follow your deployment provider's instructions
```

### Step 3: Verify Deployment

1. **Test in development first:**
   ```bash
   npm run dev
   # Open http://localhost:8080
   ```

2. **Check the Profile page:**
   - Navigate to My Profile
   - Add a new address if you don't have one
   - Click "Make default" button
   - Verify badge shows "Default"

3. **Test the full workflow:**
   - Create a customer account and set default address
   - Create a worker account and place a bid on a job
   - Accept the bid as customer
   - Verify default address is now shared (auto-shared by trigger)
   - Try to change address - should work once
   - Try to change again - should be blocked with message

## Troubleshooting

### Error: "Could not find the 'default_address_id' column"

**Cause:** Migration hasn't been applied yet.

**Solution:**
1. Apply the migration using one of the methods above
2. Wait 30 seconds for Supabase to sync
3. Refresh the page in your browser
4. Try again

**Workaround while waiting:**
- The frontend has fallback logic to work without the column
- Features will be partially available
- Once migration is applied, full features unlock

### Error: "address_changed column not found"

Same as above - migration not applied yet.

### Address not auto-shared after bid accepted

**Causes:**
1. Customer doesn't have a default address set
2. Migration not applied (trigger not active)
3. Job status didn't actually change to "accepted"

**Fix:**
1. Verify customer has default address set in profile
2. Check migration was applied successfully
3. Manually share address via ShareAddressDialog for now

## Rollback Instructions

If something goes wrong, you can rollback:

```bash
# Using Supabase CLI
supabase db reset

# Or manually delete columns in SQL editor:
ALTER TABLE public.profiles DROP COLUMN IF EXISTS default_address_id CASCADE;
ALTER TABLE public.job_requests DROP COLUMN IF EXISTS original_shared_address_id CASCADE;
ALTER TABLE public.job_requests DROP COLUMN IF EXISTS address_changed CASCADE;

# Drop triggers
DROP TRIGGER IF EXISTS profiles_validate_default_address ON public.profiles;
DROP TRIGGER IF EXISTS jobs_auto_share_default_address ON public.job_requests;
DROP TRIGGER IF EXISTS jobs_guard_address_change_limit ON public.job_requests;

# Drop functions
DROP FUNCTION IF EXISTS public.validate_default_address();
DROP FUNCTION IF EXISTS public.auto_share_default_address();
DROP FUNCTION IF EXISTS public.guard_address_change_limit();
```

## Feature Documentation

See `DEFAULT_ADDRESS_FEATURE.md` for complete feature documentation including:
- User flow diagrams
- Technical implementation details
- Testing checklist
- How the auto-share trigger works

## Support

If you encounter issues:

1. Check browser console for errors (F12)
2. Check Supabase logs in dashboard
3. Verify migration was applied: 
   - Go to Supabase Dashboard → SQL Editor → `\d profiles`
   - Look for `default_address_id` column
4. Run the migration again if needed

## Timeline

- **Immediate (5 min):** Apply migration
- **Within 1 min:** Frontend code deployed
- **Within 30 sec:** Supabase syncs schema cache
- **Ready to use:** Feature fully functional

Total time: ~10-15 minutes from start to full deployment.
