# CLAUDE.md

Project context and rules for Claude Code. Read this fully before every task.

## What this is

Booking and practice-management software for a small wellness business offering
photobiomodulation therapy (PBMT) and natural products (creams, ointments) to
humans and animals (mostly dogs).

- **One practitioner** (the owner). One location. Clients come to her.
- **Payment happens in person.** No online payments.
- **Products are sold in-session only.** The website just displays them.
- **The owner is older and not tech-savvy.** Her part of the app must be extremely simple.

## The plan

The full build plan is in `docs/PLAN.md`. Work through it **one phase at a time**:

1. Read the phase, then propose a short plan before writing code.
2. Implement only that phase. Do not start the next phase.
3. Make sure `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
4. Tick the phase's checkboxes in `docs/PLAN.md`.
5. Summarise what was done and anything that needs a human decision, then stop.

If something in the plan is unclear or seems wrong, ask instead of guessing.

## Hard constraints

- **In-house only.** No third-party SaaS: no Supabase, Firebase, Clerk, Auth0,
  Stripe, Twilio, WhatsApp, Resend, Cal.com, Vercel-specific features, analytics
  services, or hosted queues. Email goes out over plain SMTP via Nodemailer.
- **Keep dependencies minimal.** Before adding any npm package, say why it is
  needed. Prefer writing small utilities ourselves (e.g. `.ics` generation,
  calendar grids). Pin exact versions.
- **One app, one database.** A single Next.js app serves the public site,
  the owner's app and the admin area. All of them read and write the same
  Postgres database through the same server-side code.
- **MVP scope.** Do not add features that are not in `docs/PLAN.md`.

## Tech stack

- Next.js (App Router, latest stable), TypeScript `strict`, React Server Components
  and Server Actions for mutations
- Tailwind CSS
- PostgreSQL 16, Drizzle ORM + drizzle-kit migrations
- Zod for all input validation (shared between forms and server)
- Auth: our own email + password (argon2 via `@node-rs/argon2`) with DB-backed sessions
- Dates: `date-fns` + `@date-fns/tz`
- Email: `nodemailer`
- Tests: Vitest (unit/integration), Playwright (a few end-to-end flows)
- Package manager: pnpm
- Local dev: Docker Compose for Postgres
- Production: single VPS, Docker Compose (Caddy + web + Postgres + backup)

## Project layout

```
src/
  app/
    (public)/          public website + booking flow
    app/               the owner's PWA (protected)  -> /app
    admin/             stats + settings (protected) -> /admin
    api/               only if a route handler is truly needed
  db/
    schema.ts          Drizzle schema
    index.ts           db client
    seed.ts
  domain/              pure business logic, no Next.js imports
    slots.ts           slot generation
    booking.ts         create bookings, cancel by token, the manage-link view
    booking-status.ts  owner: done / didn't come / undo / cancel / notes
    booking-products.ts products sold in a session
    ...
  lib/                 auth, email, ics, rate-limit, utils
  components/
drizzle/               generated + hand-written SQL migrations
scripts/               CLI scripts (create user, send reminders, backup)
docs/
```

Business rules live in `src/domain/` and are unit tested. Pages and server
actions stay thin: validate input with Zod, call a domain function, render.

## Time and dates

- Store every timestamp as `timestamptz` (UTC).
- The business timezone is `Africa/Johannesburg` (UTC+2, no daylight saving).
  Keep it in one constant/settings value; never hardcode offsets.
- All "what day is it / what are today's slots" logic runs in the business
  timezone, not the server's or the browser's.

## Data rules

- Double-booking is prevented by a Postgres exclusion constraint on
  `appointment.during` (see PLAN.md). Never rely on an app-level check alone.
  Map the constraint violation (SQLSTATE `23P01`) to a friendly
  "that time was just taken" error.
- Money is stored as integer cents (`price_cents`). Currency is ZAR.
- Never hard-delete clients, pets or appointments from the UI. Cancel or archive.
- Client data is personal information under POPIA: never log names, phone
  numbers, emails or notes. Log IDs only.

## UX rules for `/app` (the owner's app)

This is the most important part of the product. She must be able to use it
without help.

- Mobile-first, installed as a PWA on her phone.
- Base font size at least 18px; buttons at least 48px tall and full width where possible.
- High contrast. No grey-on-grey text.
- Exactly three bottom tabs: **Today**, **Calendar**, **Clients**. No hamburger
  menus, no hidden gestures (no swipe-to-delete, no long-press).
- Plain words on buttons ("Done", "Didn't come", "Block this day"). No icons
  without text labels.
- Every destructive action asks "Are you sure?" with large Yes/No buttons.
- Notes autosave; show a clear "Saved" message.
- Long-lived login so she rarely has to sign in.

## UX rules for the public site

- Simple, warm, readable, fast. Works well on mobile.
- Booking flow must be completable in under a minute.
- No client accounts. Clients manage a booking via a private link with a token.

## Code style

- Small, readable functions. Explicit types on exported functions.
- No `any`. No non-null assertions unless justified in a comment.
- Server-only modules import `server-only`.
- Write tests alongside domain code (`*.test.ts`).
- Conventional commits (`feat:`, `fix:`, `chore:`...). One commit per logical step.

## Commands

```
pnpm dev            # start Next.js
pnpm build          # production build (standalone output, as in the Docker image)
pnpm start          # run that build like production does (PORT, default 3000)
pnpm db:up          # start local Postgres (docker compose)
pnpm db:down        # stop local Postgres (data is kept in the volume)
pnpm db:generate    # generate migration from schema
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed services, hours, settings
pnpm user:create    # create a login for the owner/admin
pnpm reminders:send # email tomorrow's clients a reminder (each at most once)
pnpm jobs:run       # production scheduler: runs reminders:send daily at REMINDER_TIME
pnpm test           # vitest
pnpm test:watch     # vitest in watch mode
pnpm test:int       # integration tests against a fresh <db>_test database (needs db:up)
pnpm test:e2e       # playwright: builds the app, runs it on :3100 against a fresh <db>_e2e database
pnpm typecheck
pnpm lint
pnpm format         # prettier --write
pnpm format:check   # prettier --check (runs in CI)
```

Keep this list up to date as scripts are added.