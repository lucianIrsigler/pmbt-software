# Development plan (MVP)

Work through these phases in order. Stop after each phase for review.
See `CLAUDE.md` for rules, stack and conventions.

---

## Phase 0: Scaffold

- [x] Create Next.js app (App Router, TypeScript strict, Tailwind, ESLint, `src/` dir) with pnpm
- [x] Add Prettier, Vitest, Playwright
- [x] `docker-compose.dev.yml` with Postgres 16 (named volume, port 5432)
- [x] Drizzle + drizzle-kit configured; `src/db/index.ts` exports a db client
- [x] `.env.example` with `DATABASE_URL`, `APP_URL`, `IP_HASH_SECRET`, `SMTP_HOST`,
      `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `BUSINESS_TZ=Africa/Johannesburg`
- [x] Env vars parsed and validated with Zod at startup (`src/lib/env.ts`)
- [x] All scripts from CLAUDE.md "Commands" exist in `package.json` (placeholders OK)
- [x] GitHub Actions CI: install, typecheck, lint, unit tests

**Done when:** `pnpm db:up && pnpm dev` shows a placeholder home page, and CI is green.

---

## Phase 1: Database schema

Create the Drizzle schema in `src/db/schema.ts`:

| Table | Key columns |
|---|---|
| `client` | id (uuid), name, phone, email, notes, archived_at, created_at |
| `pet` | id, client_id → client, name, species, breed, notes, archived_at |
| `service` | id, name, description, for_kind (`human` \| `animal`), duration_min, buffer_min (default 10), price_cents, sort_order, active |
| `product` | id, name, description, price_cents, sort_order, active |
| `working_hours` | id, weekday (0–6, 0 = Sunday), start_time, end_time |
| `time_off` | id, during (tstzrange), reason, removed_at (set on removal; the row is kept) |
| `appointment` | id, client_id, pet_id (nullable: null = client is treated), service_id, during (tstzrange, includes buffer), status (`booked` \| `done` \| `no_show` \| `cancelled`), source (`web` \| `app`), notes, manage_token (unique), price_cents (price when booked), cancelled_at, reminder_sent_at, created_at, updated_at |
| `appointment_product` | appointment_id, product_id, qty, price_cents (PK on both ids) |
| `settings` | single row: business_name, min_notice_hours (12), max_days_ahead (42), slot_step_min (30), cancel_cutoff_hours (24) |
| `user` | id, email (unique), name, password_hash, created_at |
| `session` | id (random token hash), user_id, expires_at, created_at |
| `rate_limit` | key, window_start, count (PK on key + window_start) |

Tasks:

- [x] Schema with enums or check constraints for status, source, for_kind
- [x] Hand-written SQL migration (Drizzle doesn't model exclusion constraints) adding:
      ```sql
      alter table appointment
        add constraint appointment_no_overlap
        exclude using gist (during with &&)
        where (status in ('booked', 'done'));
      ```
      A visit marked done keeps its time; cancelled and no-show free it
      (originally `status = 'booked'`, widened in migration `0004_done_blocks_time.sql`).
- [x] Indexes: `appointment(lower(during))`, `appointment(client_id)`, `pet(client_id)`, trigram or simple index on `client(name)`
- [x] `src/db/seed.ts`: settings row, Mon–Fri 09:00–17:00 + Sat 09:00–13:00, 3 human and 3 animal sample services, 3 sample products. Idempotent.
- [x] Integration test: inserting two overlapping `booked` appointments fails with `23P01` (also when one is `done`); overlapping when one is `cancelled` or `no_show` succeeds

**Done when:** `pnpm db:migrate && pnpm db:seed` works on a fresh DB and the overlap test passes.

---

## Phase 2: Domain logic (no UI)

All in `src/domain/`, fully unit tested, no Next.js imports.

- [x] `slots.ts`: pure function
      `getAvailableSlots({ date, service, workingHours, timeOff, appointments, settings, now, tz })`
      returns start times (as Date) where `[start, start + duration + buffer)`:
  - falls inside working hours for that weekday (in business tz)
  - doesn't overlap time off or booked appointments
  - starts on a `slot_step_min` boundary
  - is at least `min_notice_hours` after `now`
  - is within `max_days_ahead`
- [x] `getAvailableDates(month, ...)`: which days in a month have at least one slot (for the date picker)
- [x] Tests for: closed days, time off spanning days, a booking in the middle of the day, a service that doesn't fit before closing, min notice, horizon, buffer handling
- [x] `booking.ts`:
  - `createBooking(input)`: in one transaction, find-or-create client (match on phone, normalised), optionally create pet, insert appointment with a random `manage_token` (32 bytes, base64url). Map `23P01` to a typed `SlotTakenError`.
  - `cancelBookingByToken(token)`: respects `cancel_cutoff_hours`
  - `markDone(id)`, `markNoShow(id)`, `cancelByOwner(id)`, `updateNotes(id, notes)`
  - `addProductToAppointment(...)`, `removeProductFromAppointment(...)`
- [x] Zod schemas for every input in `src/domain/schemas.ts`
- [x] Phone normalisation helper (South African numbers to `+27...`) with tests

**Done when:** `pnpm test` covers all of the above and passes.

---

## Phase 3: Public website + booking flow

- [x] Layout: header with business name, simple nav (Home, Services, Products, Book), footer with contact info and a link to the privacy notice
- [x] `/`: short intro to PBMT and natural products, "Book now" button
- [x] `/services`: grouped into "For you" and "For your animals", showing duration and price
- [x] `/products`: display only, note "available at your session"
- [x] `/privacy`: placeholder POPIA privacy notice (mark clearly as TODO for the owner to review)
- [x] `/book` multi-step flow (URL search params for state, works without client JS where possible):
  1. Choose service
  2. Choose date (month view; unavailable days disabled)
  3. Choose time (grid of slot buttons)
  4. Details: name, phone, email (optional), and for animal services pet name, species, breed. Consent checkbox linking to privacy notice.
  5. Confirm → server action → `createBooking`
- [x] On `SlotTakenError`: return to step 3 with "Sorry, that time was just taken, please pick another"
- [x] Spam protection: hidden honeypot field; DB-backed rate limit (e.g. 5 bookings per IP per hour); max 2 future `booked` appointments per phone number
- [x] `/booking/[token]`: shows booking details, "Add to calendar" (.ics download), and a Cancel button (with confirmation) if before the cutoff
- [x] Confirmation page with booking summary and the manage link
- [x] Playwright e2e: book a human service, book an animal service, cancel via token

**Done when:** a visitor can book and cancel on mobile, and the e2e tests pass.

---

## Phase 4: Authentication

- [x] Password hashing with argon2; `scripts/create-user.ts` (`pnpm user:create`) prompts for email, name, password
- [x] `/login` page: large inputs and button, friendly error message
- [x] Sessions: random token in an httpOnly, secure, sameSite=lax cookie; only a hash stored in `session`; 90-day expiry, refreshed on use
- [x] Middleware protecting `/app/**` and `/admin/**`; server actions re-check the session
- [x] Logout (tucked away on a small settings screen in `/app`, not on a main tab)
- [x] Login rate limiting (DB-backed)
- [x] Tests for hash/verify, session expiry, protected route redirect

**Done when:** only logged-in users reach `/app` and `/admin`, and her session lasts for weeks.

---

## Phase 5: Owner app — Today tab

Follow the `/app` UX rules in CLAUDE.md strictly.

- [x] `/app` layout: bottom tab bar with **Today**, **Calendar**, **Clients** (text labels, large)
- [x] **Today** (`/app`): date heading ("Tuesday 3 November"), list of today's non-cancelled appointments as large cards: time, client name, pet name + species if any, service name. Empty state: "No bookings today."
- [x] Appointment detail (`/app/appointment/[id]`):
  - client phone as a tap-to-call link
  - client and pet notes (read-only here)
  - previous visits for this client/pet (date, service, first line of notes), including "Didn't come" and cancelled ones, labelled
  - large notes textarea with autosave (debounced) and a visible "Saved" message
  - "Products sold" section: big "+ Add product" button → simple list to tap; shows added items with a remove button
  - two big buttons: **Done** and **Didn't come** (with confirmation); after that, the status is shown with an "Undo" option
  - smaller "Cancel booking" at the bottom, with confirmation
- [x] Today list refreshes when she returns to the tab (no websockets needed)

**Done when:** she can get through a full day (see appointments, take notes, mark done) with no instructions.

---

## Phase 6: Owner app — Calendar tab

- [x] Week view (`/app/calendar`), defaulting to this week; big "← Previous week" / "Next week →" buttons. On narrow screens show one day at a time with prev/next day buttons instead of a cramped grid.
- [x] Appointments shown as blocks with time and name; tapping opens the appointment detail
- [x] Time off shown as a grey "Away" block
- [x] Tap an empty slot → "New booking" screen:
  1. Search existing client by name/phone, or "New client" (name, phone)
  2. Choose pet (or "for the client") or add a new pet
  3. Choose service
  4. Confirm (uses `createBooking` with `source = 'app'`; she may override min notice
     and book beyond `max_days_ahead`)
- [x] "Block time" button: whole day or a time range, with optional reason; list of upcoming blocks with remove option.
      Bookings already inside a new block are kept and listed so she can call them.
      Removing a block keeps it as a record (`removed_at`) rather than deleting it.
- [x] Shared week-grid component built in-house (no calendar library)

**Done when:** she can add a phone booking and block a day off in a few taps, and those times disappear from the public booking page.

---

## Phase 7: Owner app — Clients tab

- [x] Search box at the top (name or phone), results as large rows; before searching, the 20 most recently seen clients
- [x] Client page: contact details (editable), notes (autosave), pets list (add/edit/archive), visit history (newest first) linking to appointments
- [x] "Add client" button
- [x] Archive client (with confirmation) instead of delete. Archiving cancels their upcoming bookings
      (the confirmation says how many); archived clients and animals can be brought back.

**Done when:** she can find any client in seconds and see their full history.

---

## Phase 8: PWA

- [x] Web app manifest (name, icons, `start_url: /app`, `display: standalone`, theme colour).
      "My bookings", with placeholder icons (a white B on green) drawn by `next/og`; linked only
      from `/app` and `/login`.
- [x] Minimal service worker: cache static assets only; show a friendly "You're offline" page. Do not cache API/data responses.
- [x] Install instructions page for the owner (with screenshots placeholders) at `/app/help`

**Done when:** it installs to an Android/iOS home screen and opens straight into `/app`.
(Needs checking by hand on real phones over HTTPS, e.g. after Phase 11.)

---

## Phase 9: Email (SMTP, in-house)

- [x] `src/lib/email.ts`: Nodemailer transport from env; in development, log emails to the console instead of sending
- [x] `src/lib/ics.ts`: generate a valid `.ics` (VEVENT with UID, DTSTART/DTEND in UTC, SUMMARY, LOCATION); unit tested
- [x] Booking confirmation email (only if client gave an email) with .ics attached and manage link.
      Also for bookings the owner makes in the calendar.
- [x] Cancellation email (client cancels or owner cancels), including bookings cancelled by
      archiving a client or animal. The attached .ics has `STATUS:CANCELLED`.
- [x] `scripts/send-reminders.ts` (`pnpm reminders:send`): emails tomorrow's clients; records sent reminders so re-running doesn't double send (add `reminder_sent_at` to `appointment`)
- [x] Plain, readable HTML + plain-text versions of every email
- [x] Email failures must never break booking: send after commit (Next.js `after()`), catch and log by appointment id

**Done when:** booking, cancelling and the reminder script all produce correct emails in dev.

---

## Phase 10: Admin area

For the developer/son mostly; desktop-friendly is fine.

- [x] `/admin` dashboard with a date range picker (this month / last month / last 3 months / custom):
  - bookings total, done, no-shows, cancelled, no-show rate
  - new vs returning clients
  - human vs animal split
  - estimated revenue (services done + products sold), at the prices saved at booking/sale time
    (`appointment.price_cents`, added in this phase)
  - top services and top products
  - busiest weekdays
- [x] Implement stats as SQL queries/views in `src/db/stats.ts` with integration tests on seeded data
- [x] Simple bar charts as plain SVG/CSS (no chart library)
- [x] CRUD screens: services, products, working hours, settings. Services and products are hidden,
      never deleted.
- [x] Recent bookings table with filters (status, source) and CSV export

**Done when:** you can change prices/hours without touching code and see monthly stats.

---

## Phase 11: Production deployment (single VPS)

Built and tested locally (the production images and compose file run on a dev machine with
`DOMAIN=localhost`). Files for the server are in `deploy/`; see `docs/RUNBOOK.md`.

- [x] `Dockerfile` using Next.js standalone output, multi-stage, non-root user
      (targets: `web`, and `tools` for migrations, scripts and the jobs scheduler)
- [x] `docker-compose.prod.yml`: `caddy` (automatic HTTPS), `web`, `db` (Postgres 16, volume, not exposed publicly), `backup`
      (in `deploy/`, plus `migrate` and `jobs`)
- [x] `Caddyfile` for the domain
- [x] Migrations run as a one-off step before the web container starts
- [x] Cron in the backup container: nightly `pg_dump` (compressed), keep 14 daily + 8 weekly, copy offsite via `rsync`/`scp` to a second machine (configurable)
- [x] Cron for `send-reminders` (e.g. daily 17:00 business time): an in-house scheduler
      (`pnpm jobs:run`) in the `jobs` container instead of cron, so it runs as a non-root user
- [x] GitHub Actions deploy workflow: build image, push to GitHub Container Registry, SSH to VPS, pull, migrate, `docker compose up -d`
      (`.github/workflows/deploy.yml`; off until the `DEPLOY_ENABLED` variable is set)
- [x] `docs/RUNBOOK.md`: first-time server setup (firewall, SSH keys, Docker), deploying, viewing logs, **restoring a backup (tested)**, creating a user, rotating secrets
- [x] Health check endpoint `/api/health` (checks DB) used by Docker. Also `/api/health/live`
      (no DB): Docker's health check uses that one; deploys check `/api/health`.

Still to do, needs the real server, domain and secrets (runbook sections 3–7 and 10):

- [ ] Server set up, DNS pointing at it, `.env` filled in, GitHub secrets set, `DEPLOY_ENABLED=true`
- [ ] First deploy from a push to `main`, HTTPS working on the domain
- [ ] Off-server backup copy configured and tested
- [ ] Restore drill on the real server

**Done when:** a push to `main` deploys, HTTPS works, and a backup has been restored into a scratch database successfully.

---

## Phase 12: Improvements after the MVP

Moved from `docs/IMPROVEMENTS.md` (calendar, clients, code and database).

Calendar:

- [ ] Calmer week view: empty times in the week grid are plain, highlighted with "Book" on
      hover/focus only. The one-day (phone) view is unchanged.
- [ ] "Didn't come" visits shown faded on the calendar; where they overlap something else they
      take the right third of the column.
- [ ] "Go to date": jump to any date with the phone's date picker (plain form, no JS needed).
- [ ] A "Now" line on today's column; on first open, scroll it into view if it is off screen.
- [ ] Back link from an appointment goes back where it came from ("← Calendar" to that day,
      "← <client>" from their history), validated so it can't point anywhere else.

Clients:

- [ ] "New booking" button on the client page: opens the calendar with "Booking for <name>",
      tapping a free time skips choosing the client.
- [ ] "Archived clients" list (`/app/clients/archived`), linked from the Clients tab when there are any.

Code and database:

- [ ] Unique index on `lower(user.email)` instead of a unique constraint on the raw column
- [ ] GiST index on `time_off.during`
- [ ] `.ics`: `ORGANIZER` (settings contact email, else `MAIL_FROM`) and `SEQUENCE`, so strict
      calendar apps (Outlook) accept cancellations
- [ ] Rename `SESSION_SECRET` to `IP_HASH_SECRET` (it only hashes IPs for rate limits)
- [ ] Split `src/domain/booking.ts` into `booking.ts` (create, cancel by token, view),
      `booking-status.ts` and `booking-products.ts`
- [ ] One shared `Step` component for the public and the owner booking flows
- [ ] Lint rule `@typescript-eslint/explicit-module-boundary-types` (not for tests, pages and components)

**Done when:** all of the above work, `docs/UAT.md` covers them, and every check passes.

---

## Out of scope for MVP (do not build)

Online payments, deposits, WhatsApp/SMS, client accounts, multiple practitioners or rooms,
home visits, online product sales, two-way calendar sync, medical aid billing,
native mobile apps, multi-language.

Ideas for after the MVP are collected in `docs/IMPROVEMENTS.md`.
