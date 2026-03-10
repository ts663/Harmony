# Harmony Backend

Express + tRPC server for the Harmony chat application.

## Architecture

> **Before making changes to this backend, read the unified backend architecture document:**
> [`docs/unified-backend-architecture.md`](../docs/unified-backend-architecture.md)

The architecture doc covers:
- **Module map** — what each module (M-B1–M-B7, M-D1–M-D3) owns and its boundaries
- **Class diagrams** — all services, repositories, controllers, entities, and DTOs
- **Data model** — ER diagram for all shared database tables
- **API surface** — tRPC procedures and public REST endpoints
- **Event bus** — Redis Pub/Sub event flow between modules
- **Cache strategy** — Redis key layout and TTLs
- **Security model** — rate limiting, visibility guards, content filtering

Use the module map (§2.2) as your entry point when navigating the codebase.

## Development

```bash
npm install
npm run dev       # tsx watch (hot reload)
npm run build     # tsc → dist/
npm run lint      # eslint src tests
npm test          # jest
```

## Setting Up Locally

```bash
# 1. Start all required services (Postgres + Redis)
docker compose up -d

# 2. Copy env (only once) — then edit JWT secrets before running!
cp .env.example .env
# Open .env and set strong, unique values for:
#   JWT_ACCESS_SECRET=<random string, 32+ chars>
#   JWT_REFRESH_SECRET=<random string, 32+ chars>
# The placeholder values in .env.example are insecure and will cause
# a hard crash on startup if the JWT_ACCESS_SECRET variable is missing.

# 3. Apply migrations (once, and again after any schema change)
npx prisma migrate deploy

# 4. Run tests
npm test
```

> **Why both Postgres and Redis?**
> Redis is required for auth token storage, visibility caching, the Pub/Sub event bus, and guest sessions (see §4.4 and §6 of `docs/unified-backend-architecture.md`). Starting only Postgres will cause auth and all caching/event features to fail.

## Environment

Copy `.env.example` to `.env` and fill in values before running locally.

Key variables: `DATABASE_URL`, `REDIS_URL`, `FRONTEND_URL`, `PORT` (default `4000`).

> **Security:** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env.example` are placeholder values that **must** be replaced with strong, unique secrets before running the server. Using the default placeholders allows anyone to forge authentication tokens.
