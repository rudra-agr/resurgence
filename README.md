# Resurgence
Flow: coordinator posts need -> Channel3 finds real products -> donor pays (PayPal sandbox) -> ledger updates.

## Run
1. `npm install`
2. `cp .env.example .env.local` and fill the keys (database, PayPal sandbox app, Channel3, Groq)
3. `npm run dev` -> http://localhost:3000

Optional: set `NEXT_PUBLIC_SITE_URL` to your deployed URL so canonical and Open Graph links are correct.

## Routes
- `/` landing page with live figures and a live proof trail
- `/needs` needs ledger, `/needs/[id]` shareable proof trail, products and donation
- `/donations` donations ledger (CSV export)
- `/post` post a need (coordinators), `/staff` staff login

Design tokens live at the top of `app/globals.css`. Shared ledger helpers are in `lib/ledger.ts`.

Sandbox only. Supplier payouts are simulated.
