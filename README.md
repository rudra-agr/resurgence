# Resurgence

**Not just sanctioned. Sanctuary.** Every relief dollar, traced.

Resurgence is a transparent disaster-aid platform. A local coordinator posts what a community needs, real products are matched to each need, donors pay through PayPal, and every step (funding, purchase, delivery) is written to a public proof trail that anyone can check.

> **Sandbox only.** All payments use the PayPal sandbox. No real money moves, and supplier payouts are simulated. All sample people, places and figures in the seed data are for demonstration.

**Live demo:** https://resurgence-98xo.onrender.com

---

## How it works

1. A coordinator posts a need (free text in any language, or a form). Groq turns the message into a structured need.
2. Channel3 finds real products and prices for each item.
3. A donor pays with PayPal. The server creates and captures the order, records the donation once, and updates the ledger.
4. Staff add evidence (purchase, delivery). Each step appears on the need's public proof trail.
5. A PayPal webhook acts as a safety net: it records a payment if the donor's browser never reported it, and keeps the ledger correct when a refund happens outside the app.

## Features

- Public needs ledger and donations ledger (CSV export, with formula-injection protection)
- Shareable proof trail per need, with masked donor names and payment IDs
- PayPal checkout (sandbox) with server-side amount, currency and limit checks
- Idempotent payment recording, row locking, pre-capture validation and automatic refund on post-capture failure
- Verified PayPal webhooks (capture completed, refunded, reversed, denied, customer dispute)
- Grounded AI assistant that answers from the live ledger, replies in the visitor's language, suggests where to donate, and offers follow-up questions
- AI need extraction from messages written in any language
- Staff area: coordinator console, admin refunds, evidence approval
- Admin analytics dashboard (AG Grid, AG Charts, AG Studio) and delivery scheduler (Bryntum)
- Rasuwa story page with the disaster context and relief figures
- Light and dark themes, responsive layout

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript 5 |
| Database | PostgreSQL with Prisma 6 (migrations and seed scripts) |
| Payments | PayPal Orders v2 REST API, `@paypal/react-paypal-js`, PayPal webhooks (sandbox) |
| AI | Groq (default model `llama-3.3-70b-versatile`) for need extraction and the assistant |
| Product matching | Channel3 API |
| Grids and charts | AG Grid Community 36, AG Charts Community 14, AG Studio 3, Chart.js 4 |
| Scheduling | Bryntum Scheduler 7 (trial build) |
| Validation | Zod |
| Testing | Node test runner via `tsx` |
| CI | GitHub Actions (typecheck, tests, build, audit, gitleaks) |
| Hosting | Render (web service and PostgreSQL) |
| Other | open.er-api.com for a display-only USD to NPR rate (falls back to a fixed rate) |

## Requirements

**Software**

- Node.js 20 or newer (`engines` requires `>=20`; CI uses 20)
- npm (installed with Node)
- PostgreSQL (local, or a hosted database such as Render or Neon)
- Git

**Accounts and keys**

| Service | Needed for | Where to get it |
|---|---|---|
| PayPal Developer (free) | Sandbox checkout | https://developer.paypal.com, then Apps & Credentials, Sandbox, Create App. Copy the Client ID and Secret. |
| Groq | Need extraction and the assistant | https://console.groq.com |
| Channel3 | Product matching | https://trychannel3.com |
| AG Studio licence (optional) | Removes the watermark on the admin analytics dashboard | AG Grid |

## Dependencies

Installed automatically by `npm install`. Exact versions are pinned in `package.json` and `package-lock.json`.

**Runtime**

| Package | Version |
|---|---|
| next | 14.2.35 |
| react, react-dom | 18.3.1 |
| @prisma/client, prisma | 6.19.3 |
| @paypal/react-paypal-js | 8.7.0 |
| zod | 3.25.76 |
| ag-grid-community, ag-grid-react | 36.2 |
| ag-charts-community, ag-charts-react | 14.2 |
| ag-studio, ag-studio-react | ^3.0.0 |
| chart.js | ^4.6.1 |
| @bryntum/scheduler (trial build), @bryntum/scheduler-react | 7.3.8 |

**Development**

| Package | Version |
|---|---|
| typescript | ^5.9.3 |
| tsx | 4.19.2 |
| @types/node | ^22.20.5 |
| @types/react, @types/react-dom | 18.3.12, 18.3.1 |

## Installation

### 1. Get the code

```bash
git clone https://github.com/rudra-agr/resurgence.git
cd resurgence
npm install
```

`npm install` also runs `prisma generate` automatically.

### 2. Create a database

Create an empty PostgreSQL database, for example:

```bash
createdb resurgence
```

Your connection string will look like `postgresql://USER:PASSWORD@localhost:5432/resurgence`. Hosted databases often need `?sslmode=require` at the end.

### 3. Configure environment variables

```bash
cp .env.example .env
```

On Windows PowerShell use `copy .env.example .env`.

Fill in `.env`. It is ignored by git. Use `.env` (not only `.env.local`), because the Prisma commands read `.env`, and Next.js reads it too.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | 32 or more random characters. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SEED_ADMIN_PASSWORD` | For seeding | 12 or more characters. Password for the demo admin account |
| `SEED_COORDINATOR_PASSWORD` | For seeding | 12 or more characters. Password for the demo coordinator account |
| `PAYPAL_CLIENT_ID` | Yes | Client ID of your PayPal sandbox app |
| `PAYPAL_CLIENT_SECRET` | Yes | Secret of your PayPal sandbox app |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes | The same Client ID, exposed to the browser for the PayPal button |
| `PAYPAL_BASE` | No | Defaults to `https://api-m.sandbox.paypal.com` |
| `CHANNEL3_API_KEY` | Yes | Channel3 API key (product matching) |
| `GROQ_API_KEY` | Yes | Groq API key (extraction and assistant) |
| `GROQ_MODEL` / `GROQ_MODELS` | No | Override the model, or give a comma-separated fallback list |
| `PAYPAL_WEBHOOK_ID` | No | Needed only if you set up webhooks. Without it the webhook route answers 503 |
| `NEXT_PUBLIC_SITE_URL` | No | Your deployed URL, for canonical and Open Graph links |
| `NEXT_PUBLIC_AG_STUDIO_LICENCE` | No | AG Studio licence key. Without it the analytics dashboard shows a watermark |
| `NPR_PER_USD` | No | Fallback display rate if the live rate lookup fails |

Never commit real keys. Use the sandbox credentials only.

### 4. Create the tables

```bash
npx prisma migrate deploy
```

### 5. Add starter data

```bash
npx prisma db seed
```

This creates a demo region, a coordinator, five sample needs and two staff accounts:

- `admin@resurgence.demo` with the password you set in `SEED_ADMIN_PASSWORD`
- `coordinator@resurgence.demo` with the password you set in `SEED_COORDINATOR_PASSWORD`

Optional extra data, run after the step above:

| Command | Adds |
|---|---|
| `npm run seed:demo` | A richer demo ledger (Rasuwa District, Nepal) with sample needs and fictional donations |
| `npm run seed:disaster` | The Rasuwa GLOF 2026 event with casualty and damage data, for the analytics dashboard |
| `npm run seed:operations` | Sample vehicles and teams for the delivery scheduler |
| `npx tsx prisma/seed_relief.ts` | Relief contribution figures for the story page (replaces any existing rows in those two tables) |

Seed scripts refuse to run when `NODE_ENV=production`, unless you pass `ALLOW_PROD_SEED=yes` on the command line.

### 6. Start the app

```bash
npm run dev
```

Open http://localhost:3000. Staff sign in at `/staff`.

To run the production build locally:

```bash
npm run build
npm start
```

## Try the payment flow

1. In the PayPal developer dashboard go to Testing Tools, Sandbox Accounts, and open a **personal** (buyer) account. Its email and password are shown there.
2. Open a need on the site, choose an amount and pay with that sandbox buyer account.
3. The donation appears on `/donations` and on the need's proof trail. The admin page can refund it.

## PayPal webhooks (optional)

Webhooks need a public URL, so they work on a deployed site, not on `localhost` (unless you use a tunnel).

1. In the PayPal developer dashboard open your sandbox app, find Webhooks and add `https://YOUR-SITE/api/paypal/webhook`.
2. Subscribe to: Payment capture completed, refunded, reversed, denied, pending, and Customer dispute created.
3. Copy the Webhook ID into `PAYPAL_WEBHOOK_ID` and restart or redeploy.
4. Make a sandbox donation. Under Event Logs, Webhook Events you should see the event with a Success status.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Generate the Prisma client and build for production |
| `npm start` | Run the production build |
| `npm test` | Run the unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run audit` | Dependency vulnerability audit (production dependencies) |

## Deploying (example: Render)

- Create a PostgreSQL database and a Web Service from this repo (Node 20).
- Build command: `npm ci && npm run build && npx prisma migrate deploy`
- Start command: `npm start`
- Add the environment variables from the table above. Set `NEXT_PUBLIC_SITE_URL` to your service URL.
- Run the seed once, with `ALLOW_PROD_SEED=yes` on the command line, only if you want demo data in that database.

Optional: make the audit log append-only at the database level with `psql "$DATABASE_URL" -f prisma/hardening.sql` (see the comments in that file first).

## Pages and API

| Route | Purpose |
|---|---|
| `/` | Landing page with live figures and a proof trail |
| `/needs`, `/needs/[id]` | Needs ledger, and a shareable proof trail with products and donation |
| `/donations` | Donations ledger (CSV export) |
| `/post` | Post a need |
| `/staff` | Staff login |
| `/coordinator` | Coordinator console |
| `/admin/analytics` | Analytics dashboard (admin) |
| `/admin/operations` | Delivery scheduler (admin) |
| `/story` | Rasuwa story page |

API routes live under `app/api/`: `auth`, `needs`, `coordinator`, `extract`, `assistant`, `paypal` (`create-order`, `capture-order`, `webhook`) and `admin` (`refund`, `analytics`, `operations`, `studio-data`).

## Project structure

```
app/            Pages, components and API routes (Next.js App Router)
lib/            Server and shared helpers (PayPal, assistant, rate limiting, auth, ledger)
prisma/         Schema, migrations, seed scripts, optional hardening.sql
tests/          Unit tests
.github/        CI workflow
```

Design tokens live at the top of `app/globals.css`. Shared ledger helpers are in `lib/ledger.ts`.

## Security notes

- Signed, HttpOnly session cookie with password-change invalidation
- Same-origin and JSON-only checks on state-changing routes, strict Zod validation
- Per-IP and per-account rate limits (in memory, per server process), using Cloudflare client-IP headers rather than the spoofable `x-forwarded-for`
- Global request caps on the public assistant route
- Idempotent payment recording, with the amount, currency and limits checked before capture and an automatic refund if recording fails after capture
- PayPal webhook signatures are verified with PayPal's own API before any event is trusted
- Content Security Policy and other security headers in `next.config.js`
- Public ledger shows masked donor names and payment IDs

## Known limits

- Sandbox only; supplier payouts are simulated.
- The rate limiter is in memory, so limits are per server instance. Use a shared store (for example Redis) before scaling to several instances.
- Assistant answers are generated by a language model and can be wrong. The page tells visitors to check the ledger.

## License

MIT. See [LICENSE](LICENSE).