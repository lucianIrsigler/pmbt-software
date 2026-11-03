# User acceptance testing (UAT)

Manual test steps for every phase in `docs/PLAN.md`. Work top to bottom: later sections
assume the data created in earlier ones. Tick each box as you go and write down anything that
fails (step number, what you saw, a screenshot).

Automated tests (`pnpm test`, `pnpm test:int`, `pnpm test:e2e`) already cover the business
rules. UAT checks what a real person sees and does, on real devices.

---

## 0. Before you start

### Where to test

| Environment | When | Notes |
|---|---|---|
| Local dev (`pnpm db:up && pnpm dev`) | Phases 0–10 | Emails are printed to the terminal, not sent |
| Local production build (`pnpm build && pnpm start`) | Phase 8 (service worker), speed checks | Service worker only runs in a production build |
| Real server over HTTPS | Phases 8 and 11, final sign-off | Needed for PWA install on phones and real email |

### Devices

- [ ] An Android phone (Chrome)
- [ ] An iPhone (Safari)
- [ ] A desktop browser (Chrome or Firefox) for `/admin`
- [ ] Ideally: the owner's own phone, with the owner doing the Phase 5–7 tests herself

### Fresh start (local)

```
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm user:create      # create the owner's login, e.g. owner@example.com
pnpm dev
```

Use made-up client data only (no real names, phone numbers or emails), except for an email
inbox you control for the email tests.

### Test data to use

| Item | Value |
|---|---|
| Human client | "Test Person", phone `082 555 0101`, your own test email |
| Animal client | "Dog Owner", phone `082 555 0202`, pet "Rex", Dog, Labrador |
| Phone variants (same person) | `0825550101`, `+27 82 555 0101`, `27825550101` |

### Ways to check the database (optional)

`docker compose -f docker-compose.dev.yml exec db psql -U postgres -d <db name>` then e.g.
`select status, source, lower(during) from appointment order by created_at desc limit 5;`

---

## Phase 0: Scaffold

- [ ] **0.1** `pnpm install` finishes with no errors.
- [ ] **0.2** `pnpm db:up` starts Postgres; `pnpm db:down` stops it; after `db:up` again, data is still there.
- [ ] **0.3** `pnpm dev` starts and `http://localhost:3000` shows the home page.
- [ ] **0.4** Remove `DATABASE_URL` from `.env` and run `pnpm dev`: startup fails with a clear message naming the missing variable. Put it back.
- [ ] **0.5** Set `BUSINESS_TZ` to nonsense (e.g. `Mars/Base`): startup fails with a clear message. Put it back.
- [ ] **0.6** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` all pass.
- [ ] **0.7** Every command listed in `CLAUDE.md` "Commands" exists in `package.json`.
- [ ] **0.8** GitHub Actions CI is green on the latest commit (once pushed).

---

## Phase 1: Database schema

- [ ] **1.1** On an empty database, `pnpm db:migrate` runs without errors.
- [ ] **1.2** `pnpm db:seed` runs without errors. Run it a **second time**: no errors and no duplicate services, products or hours.
- [ ] **1.3** Seeded data is visible on the site: 3 human services, 3 animal services, 3 products, opening hours Mon–Fri 09:00–17:00 and Sat 09:00–13:00 (check in `/admin/hours`).
- [ ] **1.4** Settings defaults (in `/admin/settings`): min notice 12 h, max 42 days ahead, slot step 30 min, cancel cutoff 24 h.
- [ ] **1.5** Double-booking guard at the database level (psql): insert two overlapping `booked` appointments → second fails with `23P01`. Same when the first is `done`. Overlap with a `cancelled` or `no_show` one succeeds. (Also covered by `pnpm test:int`.)
- [ ] **1.6** `pnpm test:int` passes.

---

## Phase 2: Domain logic

Mostly covered by unit tests. Check the rules hold in the real UI:

- [ ] **2.1** `pnpm test` passes.
- [ ] **2.2** Sunday shows no available times on `/book` (closed day).
- [ ] **2.3** Saturday shows times only from 09:00, and the last time leaves room for the service + 10 min buffer before 13:00.
- [ ] **2.4** A long service (e.g. 60 min) does not offer 16:30 on a weekday (it would run past 17:00).
- [ ] **2.5** Times are on 30-minute boundaries (09:00, 09:30…).
- [ ] **2.6** Min notice: times less than 12 hours from now are not offered (test late in the evening: tomorrow early morning should be missing).
- [ ] **2.7** Horizon: days more than 42 days ahead are disabled in the date picker.
- [ ] **2.8** After booking 10:00, the slots that would overlap it (including the 10-minute buffer) disappear for other services too.
- [ ] **2.9** Phone normalisation: book once with `082 555 0101`, then with `+27 82 555 0101`. In `/app/clients` there is only **one** "Test Person", with both visits.
- [ ] **2.10** All times shown are South African time, even if your computer/phone is set to another timezone (change the device timezone to e.g. London and reload `/book` and `/app`).

---

## Phase 3: Public website + booking flow

Do these on a phone first, then a desktop.

### Pages

- [ ] **3.1** Header shows the business name and nav: Home, Services, Products, Book. Footer shows contact info and a privacy link.
- [ ] **3.2** `/`: intro to PBMT and natural products; "Book now" goes to `/book`.
- [ ] **3.3** `/services`: grouped "For you" and "For your animals", each with duration and price in rand (e.g. `R450`).
- [ ] **3.4** `/products`: products with prices and a note that they are available at your session. No buy/cart button.
- [ ] **3.5** `/privacy`: placeholder notice, clearly marked as needing the owner's review.
- [ ] **3.6** Text is readable on a phone without zooming; no sideways scrolling on any page.
- [ ] **3.7** Pages load quickly on mobile data.

### Booking a human service

- [ ] **3.8** `/book` → choose a human service → month view; closed and past days are disabled.
- [ ] **3.9** Next/previous month works; months beyond the horizon have no available days.
- [ ] **3.10** Choose a day → grid of time buttons. Choose a time.
- [ ] **3.11** Details: name, phone, email (optional). No pet fields for a human service.
- [ ] **3.12** Submit without ticking consent → blocked with a clear message.
- [ ] **3.13** Submit with an invalid phone (e.g. `123`) → clear error, entered data is kept.
- [ ] **3.14** Consent link opens the privacy notice.
- [ ] **3.15** Confirm → confirmation page with service, date, time, price and a manage link.
- [ ] **3.16** Time it: the whole flow takes **under a minute**.
- [ ] **3.17** Browser back button during the flow behaves sensibly (goes to the previous step, no errors).

### Booking an animal service

- [ ] **3.18** Choose an animal service → details step asks for pet name, species, breed.
- [ ] **3.19** Book for "Rex". Confirmation shows the pet.
- [ ] **3.20** Book again later for the same phone with the same pet name: in `/app/clients`, the client has only one Rex (or note what happens and flag it).

### Slot taken

- [ ] **3.21** Open the same day/time in two browsers (or a normal and private window). Complete the booking in the first, then in the second → "Sorry, that time was just taken, please pick another", back on the time step, the taken time is gone.

### Spam protection

- [ ] **3.22** With the same phone, make 2 future bookings, then try a 3rd → refused with a friendly message.
- [ ] **3.23** Make 5 bookings from the same device within an hour (different phone numbers), then a 6th → refused with a friendly message. (Reset: wait an hour or clear `rate_limit` in the DB.)
- [ ] **3.24** (Developer) Fill the hidden honeypot field with dev tools and submit → no booking created.

### Managing a booking (token link)

- [ ] **3.25** Open the manage link from the confirmation page: shows the booking details.
- [ ] **3.26** "Add to calendar" downloads an `.ics`; it imports into Google Calendar / iPhone Calendar at the correct local time and length.
- [ ] **3.27** Cancel → "Are you sure?" → Yes → booking shows as cancelled; the time is bookable again on `/book`.
- [ ] **3.28** Book a time less than 24 h away (via the owner app, Phase 6) and open its link → no Cancel button; a message explains to phone instead.
- [ ] **3.29** Change one character in the token in the URL → a friendly "not found" page, no details leaked.
- [ ] **3.30** `pnpm test:e2e` passes.

---

## Phase 4: Authentication

- [ ] **4.1** Visit `/app` logged out → redirected to `/login`. Same for `/admin` and `/app/clients`.
- [ ] **4.2** `/login` on a phone: large inputs and button, readable.
- [ ] **4.3** Wrong password → friendly error, does not say whether the email exists.
- [ ] **4.4** Correct login → lands on `/app` (Today).
- [ ] **4.5** Close the browser completely and reopen `/app` → still logged in.
- [ ] **4.6** (Developer) Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS; expiry about 90 days ahead.
- [ ] **4.7** (Developer) The `session` table stores a hash, not the cookie value.
- [ ] **4.8** Enter a wrong password 11 times for the same email within 15 minutes → told to wait; even the right password is refused until the window passes.
- [ ] **4.9** Log out: Today → "Settings" (small link) → "Log out" → back on `/login`; `/app` redirects to login again.
- [ ] **4.10** "Log out" is **not** on any main tab.
- [ ] **4.11** Log in on two devices; logging out on one leaves the other logged in.
- [ ] **4.12** `pnpm user:create` with an email that already exists → clear error, no change.

---

## Phase 5: Owner app — Today tab

Ideally hand the phone to the owner with no instructions and watch. Note every hesitation.

### Layout and rules

- [ ] **5.1** Exactly three bottom tabs: **Today**, **Calendar**, **Clients**, all with text labels.
- [ ] **5.2** Text is at least 18px; buttons at least 48px tall; high contrast throughout (check in bright daylight).
- [ ] **5.3** No hamburger menu, no swipe or long-press actions, no icon-only buttons.

### Today list

- [ ] **5.4** Heading shows today's date in words (e.g. "Tuesday 3 November").
- [ ] **5.5** Today's bookings appear as large cards with time, client name, pet name + species (if any) and service, in time order.
- [ ] **5.6** Cancelled bookings are not shown. Done / "Didn't come" ones are shown and labelled.
- [ ] **5.7** With no bookings today: "No bookings today."
- [ ] **5.8** Book something for today from another device, then switch back to the app → the new booking appears without a manual reload.

### Appointment detail

- [ ] **5.9** Tap a card → detail page. Phone number is a link; tapping it opens the phone dialler.
- [ ] **5.10** Client and pet notes are shown (read-only).
- [ ] **5.11** Previous visits for this client/pet are listed with date, service and first line of notes; "Didn't come" and "Cancelled" visits are labelled. First visit shows "This is the first visit."
- [ ] **5.12** Type in the notes box → after a moment "Saved ✓" appears. Leave the page and return → note is still there.
- [ ] **5.13** Type notes, then immediately press back → note still saved.
- [ ] **5.14** Turn on airplane mode, type notes → a clear "didn't save" message, not "Saved". Turn it off and type again → "Saved ✓".

### Products sold

- [ ] **5.15** "+ Add product" → list of products → tap one → it appears under "Products sold" with its price.
- [ ] **5.16** Add the same product twice → quantity 2 (or two lines; note which).
- [ ] **5.17** "Remove" → "Are you sure?" → Yes → gone. No → nothing changes.
- [ ] **5.18** Hidden products (Phase 10) do not appear in the add list.

### Status buttons

- [ ] **5.19** "Done" → status shows "Done ✓" with an "Undo" button. Undo → back to booked.
- [ ] **5.20** "Didn't come" → "Are you sure?" → Yes → status shows "Didn't come" with "Undo".
- [ ] **5.21** After "Didn't come", that time becomes bookable again on `/book`. After "Done", it does not.
- [ ] **5.22** Undo "Didn't come" when someone else has since booked that time → friendly "that time was just taken" message, status unchanged.
- [ ] **5.23** "Cancel booking" (small, at the bottom) → "Are you sure?" → Yes → booking disappears from Today; client gets a cancellation email (Phase 9).

**Sign-off:** the owner got through a simulated day (see bookings, write notes, add a product, mark done, mark one "Didn't come") without help.

---

## Phase 6: Owner app — Calendar tab

- [ ] **6.1** Calendar opens on this week (on a phone: today, one day at a time).
- [ ] **6.2** "Next week →" / "← Previous week" (or next/previous day on a phone) move correctly and come back.
- [ ] **6.3** Bookings show as blocks with time and name; tapping opens the appointment detail.
- [ ] **6.4** Closed days say "Closed. No bookings."
- [ ] **6.5** Empty times say "Free – tap to book".
- [ ] **6.6** Rotate a phone / widen a desktop window → layout switches between single-day and week grid without breaking.

### New phone booking

- [ ] **6.7** Tap a free slot → "New booking" with date and time pre-filled.
- [ ] **6.8** Search an existing client by part of the name → found. By phone (`0825550202`) → found. One letter → "Please type at least 2 letters or numbers."
- [ ] **6.9** Choose "Dog Owner" → choose Rex → choose an animal service → confirm → "Booked ✓"; appears in the calendar and on Today if today.
- [ ] **6.10** New client: name + phone → "for the client" → human service → confirm → client now in Clients.
- [ ] **6.11** Add a new pet during booking → pet saved on the client.
- [ ] **6.12** Book a time 2 hours from now (inside min notice) → allowed for the owner.
- [ ] **6.13** Book a date 60 days ahead (beyond the horizon) → allowed for the owner.
- [ ] **6.14** Choose a service that doesn't fit (e.g. a long one just before closing or another booking) → "No service fits at this time." or a clear warning that it may run into another booking.
- [ ] **6.15** Try to book on top of an existing booking → friendly "that time was just taken"; no double booking.

### Block time (Away)

- [ ] **6.16** "Block time" → whole day + reason "Holiday" → "Blocked ✓"; the day shows "Away" in the calendar.
- [ ] **6.17** On `/book`, that day is now disabled.
- [ ] **6.18** Block a time range (e.g. 12:00–14:00) on another day → only those times disappear on `/book`.
- [ ] **6.19** Block a period that already has a booking → the booking is **kept**, and the screen lists it with "They are not cancelled. Please call them."
- [ ] **6.20** Upcoming blocks are listed. "Remove" → "Remove this block? Clients will be able to book this time again." → Yes → times are bookable again on `/book`.
- [ ] **6.21** (Developer) The removed block still exists in `time_off` with `removed_at` set.
- [ ] **6.22** End time before start time → clear error.

**Sign-off:** the owner added a phone booking and blocked a day off in a few taps, unaided.

---

## Phase 7: Owner app — Clients tab

- [ ] **7.1** Before searching: "Recent clients" shows up to 20 recently seen clients.
- [ ] **7.2** Search by part of a name, any case → found. By phone in any format → found. No match → "No clients found."
- [ ] **7.3** Tap a client → contact details, notes, pets, visit history (newest first, each linking to the appointment).
- [ ] **7.4** "Edit details" → change phone and email → saved; invalid phone → clear error.
- [ ] **7.5** Client notes autosave with "Saved ✓" and survive leaving the page.
- [ ] **7.6** Add a pet; edit a pet's breed and notes → saved.
- [ ] **7.7** "Archive Rex" → confirmation says past visits are kept → Yes → Rex no longer offered for new bookings; history still visible. "Bring back" restores him.
- [ ] **7.8** Give a client 2 upcoming bookings, then "Archive client" → confirmation mentions **2** upcoming bookings will be cancelled → Yes → both cancelled, cancellation emails sent, times free on `/book`, client hidden from the list.
- [ ] **7.9** An archived client's page shows "This client is archived." and "Bring back"; bringing back does **not** restore the cancelled bookings.
- [ ] **7.10** "Add client" → new client with name and phone → appears in search.
- [ ] **7.11** Adding a client with a phone that already exists → clear message (no silent duplicate).
- [ ] **7.12** There is no way to delete a client, pet or appointment anywhere in the app.

**Sign-off:** the owner found a named client and told you when their last visit was, in seconds.

---

## Phase 8: PWA

Must be tested on a production build. For phones, use the real HTTPS server (after Phase 11).

- [ ] **8.1** Android/Chrome: log in → `/app/help` explains installing; "Install app" (or browser menu → "Add to Home screen") installs "My bookings" with the green B icon.
- [ ] **8.2** iPhone/Safari: Share → "Add to Home Screen" → icon appears; `/app/help` instructions match what Safari shows.
- [ ] **8.3** Opening from the home-screen icon goes straight to `/app` (Today), full screen with no browser address bar.
- [ ] **8.4** Close and reopen the installed app a day later → still logged in.
- [ ] **8.5** Airplane mode → open the app / navigate → friendly "You're offline" page, not a browser error.
- [ ] **8.6** Back online → app works normally and shows **fresh** data (bookings made while offline elsewhere appear; nothing stale from cache).
- [ ] **8.7** The public site does not prompt to install the app; the manifest is linked only from `/app` and `/login`.
- [ ] **8.8** After a new deploy, the installed app picks up the new version (close and reopen once).

---

## Phase 9: Email

In dev, emails print to the terminal. On the server, use a real inbox you control and check
both Gmail (web + phone) and one other client (e.g. Outlook or iPhone Mail).

- [ ] **9.1** Public booking **with** email → confirmation email: service, pet (if any), date, time, price, address, manage link, `.ics` attached.
- [ ] **9.2** Public booking **without** email → booking works; no email attempted.
- [ ] **9.3** Owner's calendar booking for a client with an email → confirmation email too.
- [ ] **9.4** The `.ics` opens in Google Calendar and iPhone Calendar at the right local time and length.
- [ ] **9.5** Manage link in the email works.
- [ ] **9.6** Client cancels via link → cancellation email; its `.ics` removes/marks the event cancelled in a calendar that imported it.
- [ ] **9.7** Owner cancels → cancellation email.
- [ ] **9.8** Archiving a client (or pet) with upcoming bookings → a cancellation email per booking.
- [ ] **9.9** Every email reads well as HTML and as plain text (view "original" / plain-text mode).
- [ ] **9.10** Emails don't land in spam (server only; check SPF/DKIM per the runbook).
- [ ] **9.11** Break SMTP (wrong `SMTP_PASS`) → booking still succeeds for the client; the server log shows the failure with the appointment **id only** (no name, phone or email).

### Reminders

- [ ] **9.12** Make bookings for tomorrow (with email) and for the day after.
- [ ] **9.13** `pnpm reminders:send` → reminder emails only for tomorrow's bookings.
- [ ] **9.14** Run it again → no duplicates.
- [ ] **9.15** Cancelled or "Didn't come" bookings for tomorrow get no reminder.
- [ ] **9.16** (Server) The `jobs` container sends reminders automatically at `REMINDER_TIME` (default 17:00 SA time); check the logs the next day.

### Privacy in logs

- [ ] **9.17** Search all server logs from the test session for the test names, phone numbers and emails → none found.

---

## Phase 10: Admin area

Desktop browser, logged in.

### Dashboard (`/admin`)

- [ ] **10.1** Range picker: this month, last month, last 3 months, custom; numbers change accordingly.
- [ ] **10.2** Totals (bookings, done, no-shows, cancelled, no-show rate) match a hand count of the test bookings.
- [ ] **10.3** New vs returning clients is sensible (a client's first visit = new).
- [ ] **10.4** Human vs animal split matches.
- [ ] **10.5** Estimated revenue = done services + products sold, at the prices **at booking time** (change a price later and confirm old numbers don't move).
- [ ] **10.6** Top services, top products and busiest weekdays look right; bar charts are readable.
- [ ] **10.7** An empty date range shows zeros/empty states, not errors.

### Services and products

- [ ] **10.8** Add a service (human, 45 min, R500) → appears on `/services` and `/book`.
- [ ] **10.9** Edit its price → new price on the public site; existing bookings keep the old price.
- [ ] **10.10** Change its duration → `/book` offers times that fit the new length.
- [ ] **10.11** Hide it → gone from the public site and new bookings; past bookings still show it. Show it again → back.
- [ ] **10.12** Sort order changes the order on the public pages.
- [ ] **10.13** Same checks for products (add, edit, hide/show, sort); hidden products not addable in `/app`.
- [ ] **10.14** No delete button for services or products.
- [ ] **10.15** Invalid input (negative price, 0 minutes, empty name) → clear errors.

### Working hours and settings

- [ ] **10.16** Change Saturday hours to 10:00–12:00 → `/book` reflects it immediately.
- [ ] **10.17** Close Wednesday → Wednesdays disabled on `/book`.
- [ ] **10.18** End time before start → clear error.
- [ ] **10.19** Change min notice, max days ahead, slot step, cancel cutoff and business name → each takes effect on the public site / manage page.

### Bookings table

- [ ] **10.20** `/admin/bookings`: recent bookings, filter by status and by source (web/app).
- [ ] **10.21** CSV export downloads and opens in Excel/Google Sheets with correct columns, dates in SA time and prices in rand; the filter is applied to the export.
- [ ] **10.22** Admin pages redirect to `/login` when logged out (including the CSV link).

**Sign-off:** prices and hours changed with no code changes; monthly stats visible.

---

## Phase 11: Production deployment

Follow `docs/RUNBOOK.md`. Each step below should be done by following the runbook text only;
if the runbook is unclear, note where.

### Server and first deploy (runbook 3–7)

- [ ] **11.1** Server set up per runbook 3: SSH key login as `deploy` works; password login refused; firewall allows only 22, 80, 443 (`sudo ufw status`).
- [ ] **11.2** DNS for the domain points to the server (`nslookup <domain>`).
- [ ] **11.3** `.env` filled in from `deploy/.env.example`; file permissions restricted (`chmod 600`).
- [ ] **11.4** GitHub secrets/variables set; `DEPLOY_ENABLED=true`.
- [ ] **11.5** Push to `main` → GitHub Actions builds, pushes the image, deploys; the workflow ends green after the `/api/health` check.
- [ ] **11.6** `https://<domain>` loads with a valid certificate (padlock, no warnings); `http://` redirects to `https://`.
- [ ] **11.7** `https://<domain>/api/health` returns OK; `/api/health/live` returns OK.
- [ ] **11.8** Postgres is **not** reachable from outside (`nc -zv <domain> 5432` from your own computer fails).
- [ ] **11.9** `docker compose ps` shows all containers healthy; migrations container exited successfully.
- [ ] **11.10** Seed and create the owner's login on the server per runbook 7/11; log in from a phone.
- [ ] **11.11** Run the Phase 3 booking flow and Phase 9 email checks against the live site with a test booking, then cancel it.
- [ ] **11.12** Run Phase 8 (PWA install) on the owner's real phone.

### Everyday operations (runbook 8)

- [ ] **11.13** Make a tiny visible change, push → it is live within minutes, no downtime noticed by an open `/app` session.
- [ ] **11.14** Rollback per runbook 8 → previous version live again.
- [ ] **11.15** View web and jobs logs per the runbook; no personal data in them.
- [ ] **11.16** Reboot the server → everything comes back by itself; site and health checks OK.

### Backups (runbook 9)

- [ ] **11.17** The next morning a new compressed backup exists from the nightly run.
- [ ] **11.18** Off-server copy: `BACKUP_REMOTE` set; the backup appears on the second machine.
- [ ] **11.19** Break the remote (wrong host) → backup still kept locally and the failure is visible in logs; fix it.
- [ ] **11.20** After ~15 days, only 14 daily + 8 weekly backups are kept (check later).

### Restore drill (runbook 10)

- [ ] **11.21** Restore the latest backup into a scratch database; count rows in `client` and `appointment` and compare with the live database.
- [ ] **11.22** (Optional, in a quiet moment, after a fresh backup) Full restore over the live database per runbook 10 → site works and recent test data is present.
- [ ] **11.23** Write down the date of the successful drill in the runbook or here.

### Secrets and logins (runbook 11–12)

- [ ] **11.24** Create a second admin login with `pnpm user:create` on the server; log in; remove/rotate per runbook.
- [ ] **11.25** Rotate `IP_HASH_SECRET` (or the SMTP password) per runbook 12 → app restarts and works; nobody is logged out.

**Sign-off (Phase 11 "done when"):** a push to `main` deployed, HTTPS works, and a backup was restored into a scratch database.

---

## Cross-cutting checks (do once at the end)

- [ ] **X.1** Every destructive action in `/app` asks "Are you sure?" with large Yes/No buttons.
- [ ] **X.2** Nothing can be hard-deleted from the UI (clients, pets, appointments, services, products, blocks).
- [ ] **X.3** Accessibility: whole public booking flow and `/app` usable with the phone's text size set to large; nothing cut off.
- [ ] **X.4** Keyboard-only on desktop: can tab through `/book` and `/login` and see where focus is.
- [ ] **X.5** Slow network (Chrome dev tools "Slow 3G"): buttons show they are working; double-tapping "Confirm" does not create two bookings.
- [ ] **X.6** No third-party requests: in dev tools Network tab, every request on the public site and `/app` goes to your own domain (no analytics, fonts or CDNs).
- [ ] **X.7** Money always shows as rand with sensible formatting; times always in SA time.
- [ ] **X.8** The privacy notice has been reviewed and replaced by the owner before launch.

## Issues found

| # | Step | What happened | Severity | Fixed? |
|---|---|---|---|---|
| 1 | | | | |
