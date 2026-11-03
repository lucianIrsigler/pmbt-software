# Possible improvements

Ideas noticed while building, **not** part of the MVP. Nothing here gets built until it is
moved into `PLAN.md`. Add new ideas under the right heading, with a line on why.

## Block time

- **Block several days at once.** An optional "until" date for holidays, instead of one block
  per day.
- **See removed blocks.** Removed time off is kept in the database (`removed_at`) but there is
  no screen for it yet.
- **Help with bookings inside a new block.** Today she's shown a list to phone. Now that email
  exists (Phase 9), offer to cancel them and email the clients.

## New booking (owner)

- **Say when a "new" client already exists (calendar flow).** "Add client" on the Clients tab
  now says "This phone number already belongs to …", but the calendar's "New client" step still
  quietly uses the existing client.
- **Notes while booking**, e.g. the reason for the visit, instead of adding them afterwards.
- **Book outside working hours** as a one-off favour. Not possible at the moment.
- **Typo-tolerant client search.** Search matches parts of names and phone numbers; using
  `pg_trgm` similarity (the index already exists) would also find misspellings.

## Installed app

- **Real icons.** The icons are placeholders (a white "B" on green, drawn in
  `src/lib/app-icon.tsx`). Swap in the logo: put PNGs in `public/icons/` and point
  `src/lib/manifest.ts` and `src/app/apple-icon.tsx` at them.
- **Screenshots on the help page.** `/app/help` has a placeholder box for each step.
- **"Install this app" hint.** A one-time tip on Today until the app is installed, instead of
  only the link on Settings.

## Email

- **Tell the owner about online changes.** Email her when a client books or cancels through the
  website. Left out for now: she sees every change on the Today and Calendar tabs.
