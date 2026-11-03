# Possible improvements

Ideas noticed while building, **not** part of the MVP. Nothing here gets built until it is
moved into `PLAN.md`. Add new ideas under the right heading, with a line on why.

## Calendar

- **Calmer week view on big screens.** Every empty slot shows a "Free" box, which is busy
  across seven days. Could show empty slots plainly and only highlight on hover.
- **Show "Didn't come" visits on the calendar.** They're left off because their time is free
  again and a new booking could sit on top. They could be shown faded beside it. (They do
  show on Today and in the client's history.)
- **Jump to any date.** Only previous/next day or week for now; a month picker would help
  for bookings far ahead.
- **Mark the current time on today.** A "now" line, and scrolling to it on open.
- **Back link from an appointment.** The detail page always says "← Today", even when opened
  from the calendar; it could go back to that calendar day instead.

## Block time

- **Block several days at once.** An optional "until" date for holidays, instead of one block
  per day.
- **See removed blocks.** Removed time off is kept in the database (`removed_at`) but there is
  no screen for it yet.
- **Help with bookings inside a new block.** Today she's shown a list to phone. Once email
  exists (Phase 9), offer to cancel them and email the clients.

## New booking (owner)

- **Say when a "new" client already exists.** Entering a known phone number quietly uses the
  existing client (under their saved name). An explicit "This number belongs to …" would be
  clearer.
- **Notes while booking**, e.g. the reason for the visit, instead of adding them afterwards.
- **Book outside working hours** as a one-off favour. Not possible at the moment.
- **Typo-tolerant client search.** Search matches parts of names and phone numbers; using
  `pg_trgm` similarity (the index already exists) would also find misspellings.
