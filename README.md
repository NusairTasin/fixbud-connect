## FixBud Connect

Vite + React + TypeScript frontend that uses Supabase for authentication and database access.

### Prerequisites

- **Node.js**: 18+ (20+ recommended)
- **npm**: comes with Node.js

### Setup

- **Install dependencies**:

```bash
npm install
```

- **Configure environment**:
  - Copy `.env.example` to `.env`
  - Fill in:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_PUBLISHABLE_KEY`

```bash
cp .env.example .env
```

### Run locally

```bash
npm run dev
```

Vite is configured to run on **port 8080** (see `vite.config.ts`).

### Build and preview

```bash
npm run build
npm run preview
```

### Lint and test

```bash
npm run lint
npm run test
```
