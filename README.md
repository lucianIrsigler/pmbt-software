# dog-stuff

Booking and practice-management app for a small PBMT and natural products business.

- Project rules and commands: [CLAUDE.md](CLAUDE.md)
- Build plan: [docs/PLAN.md](docs/PLAN.md)
- Database: [docs/DATABASE.md](docs/DATABASE.md) (diagram: [docs/schema.dbml](docs/schema.dbml))

## Getting started

```sh
cp .env.example .env   # then fill in values
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```
