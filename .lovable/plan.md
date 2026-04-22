
# FixBud — Phase 1: Foundation & Data Layer

Adapting the PRD to the Lovable stack (React + Vite + Lovable Cloud / Postgres) while preserving every feature, role, and rule. Schema shape, status enums, role separation, and the auto-rating behavior all match the PRD exactly.

## What Phase 1 delivers

**1. Backend foundation (Lovable Cloud / Postgres)**

Tables (Postgres equivalents of the Mongoose schemas):

- `profiles` — `id` (FK → auth.users), `name`, `email`, `average_rating` (default 0), timestamps. *Note: passwords live in Supabase Auth, not in this table — security best practice.*
- `user_roles` — separate table with `user_id` + `role` enum (`customer`, `worker`). Stored separately to prevent privilege escalation. Includes a `has_role()` security-definer function.
- `service_categories` — `name` (unique), `slug` (unique, indexed), `description`, timestamps.
- `job_requests` — `title`, `description`, `customer_id`, `worker_id` (nullable), `category_id`, `status` enum (`pending`/`accepted`/`completed`/`cancelled`, default `pending`, indexed), `budget` (numeric ≥ 0), timestamps.
- `reviews` — `job_id` (unique), `worker_id`, `customer_id`, `rating` (1–5), `comment`, timestamps.

**2. Auto-rating trigger** (PRD's post-save hook equivalent)
A Postgres trigger on `reviews` recalculates `profiles.average_rating` for the affected worker on every insert/update/delete.

**3. Status-transition guard** (Strict Rule #2)
A trigger on `job_requests` blocks impossible jumps (e.g., `pending → completed`). Allowed paths: `pending → accepted → completed`, and `pending → cancelled`.

**4. Row-Level Security** (Strict Rule #1)
- Anyone authenticated can read service categories.
- Customers see/edit only their own job requests; workers see pending jobs + jobs assigned to them.
- Reviews readable by all authenticated users; writable only by the customer who owns the completed job.
- Roles enforced via `has_role()` so customers literally cannot accept jobs and workers cannot post jobs at the DB level.

**5. Auto-profile creation**
Trigger on `auth.users` insert → creates a matching `profiles` row using sign-up metadata (name + chosen role).

**6. Seed data**
Starter `service_categories`: Plumbing, Electrical, Carpentry, Painting, Cleaning, Appliance Repair, HVAC, General Handyman.

**7. Basic landing page**
Replaces the placeholder. Hero with FixBud name + tagline ("Connect with trusted home-service pros"), short value prop, two CTAs ("Find a pro" / "Offer your services") that currently route to `/auth` (which will be built in Phase 2 — for now the buttons exist but the page is a stub). Clean, responsive, uses the design system tokens in `index.css`. No login/auth wiring yet — that's Phase 2.

## Out of scope for Phase 1

- Login / signup forms, auth flows, role-routing → **Phase 2**
- Customer dashboard, posting jobs, browsing categories → **Phase 3**
- Worker job feed, accept/complete → **Phase 4**
- Reviews UI, worker public profile → **Phase 5**

## Stack-mapping notes (for transparency)

| PRD | Implemented as |
|---|---|
| Mongoose schemas + indexes | Postgres tables + indexes |
| Mongoose `ref` / ObjectId | Postgres FKs (uuid) |
| `enum` field | Postgres `enum` types |
| Review post-save hook → updates `User.averageRating` | Postgres trigger on `reviews` → updates `profiles.average_rating` |
| Status-jump guard | Postgres trigger on `job_requests` |
| `lib/mongodb.js` connection cache | N/A — Cloud manages the connection |
| Role on User document | Separate `user_roles` table (security best practice) |

When Phase 1 is approved I'll provision Cloud, run the schema migration, seed categories, and ship the landing page. Then say **"Start Phase 2"** for auth.
