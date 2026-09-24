# Signing Platform

Original electronic-signature platform built with a Next.js frontend and Go backend.

## Current applications

- `apps/web` — Next.js frontend
- `cmd/api` — Go REST API
- `cmd/worker` — Go background worker

## Run the web application

From the repository root:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev:web
```

The root command delegates to the frontend's existing npm-managed package. Alternatively, run it directly:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3000`.

## Configure authentication

Authentication uses WorkOS AuthKit, while application users and organizations remain in the local database through provider-neutral identity mappings.

1. Create a staging application in the WorkOS dashboard.
2. Add `http://localhost:3000/auth/callback` as a redirect URI.
3. Fill in the WorkOS values in `apps/web/.env.local` and the backend environment using the two `.env.example` files.
4. Use `/auth/sign-in`, `/auth/sign-up`, and `/auth/sign-out` for the hosted flow. The existing `/signin` UI hands its actions to those endpoints.

Recipient routes under `/sign/*` remain public and use single-purpose signing tokens. Workspace routes are protected by AuthKit.

The reusable component showcase is available at `http://localhost:3000/design-system`.

Frontend component layers:

- `apps/web/src/components/ui` — accessible Radix/shadcn primitives
- `apps/web/src/components/shared` — reusable product-level compositions
- `apps/web/src/app/design-system` — visual component showcase

## Run the backend

Start PostgreSQL, object storage, and the local SMTP inbox:

```powershell
docker compose up -d postgres minio mailpit
```

Configure the current PowerShell session and start the API:

```powershell
$env:DATABASE_URL = "postgres://signing:signing@localhost:5432/signing?sslmode=disable"
$env:WEB_ORIGIN = "http://localhost:3000"
$env:WORKOS_CLIENT_ID = "client_replace_me"
$env:WORKOS_ISSUER = "https://api.workos.com/"
$env:WORKOS_JWKS_URL = "https://api.workos.com/sso/jwks/client_replace_me"
$env:TOKEN_ENCRYPTION_KEY = "replace_with_base64_encoded_32_byte_key"
$env:SMTP_HOST = "localhost"
$env:SMTP_PORT = "1025"
go run ./cmd/migrate
go run ./cmd/api
```

The API listens on `http://localhost:8080` by default:

- `GET /healthz` — process liveness
- `GET /readyz` — database readiness
- `GET /v1/` — API identity
- `GET /v1/envelopes/{envelopeId}/review` — draft readiness for the review screen
- `POST /v1/envelopes/{envelopeId}/send` — lock a ready draft and queue invitations (`Idempotency-Key` required)

Start the worker in a second PowerShell session using the same `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY`:

```powershell
go run ./cmd/worker
```

In development the worker writes invitation previews to `var/email-previews` and serves them at `http://localhost:8090`. If Mailpit is running, it also relays to `http://localhost:8025`. Set `RESEND_API_KEY` (and optionally `RESEND_FROM`) in `.env` to relay through [Resend](https://resend.com) instead of local SMTP — it takes priority over `SMTP_HOST` when both are set.

For API live reload, Air v1.67.0 is installed as a Go development tool:

```powershell
air
```

## Verify the backend

Use backend-scoped package patterns because the repository also contains JavaScript dependencies:

```powershell
go test ./cmd/... ./internal/...
go vet ./cmd/... ./internal/...
go build ./cmd/api
go build ./cmd/worker
```

## Structure

- `internal/config` — validated environment configuration
- `internal/database` — PostgreSQL connection pool
- `internal/httpapi` — routing, middleware, and health endpoints
- `internal/send` — draft review, send validation, and invitation enqueueing
- `internal/notify` — invitation job processing and retries
- `internal/email` — SMTP/Resend delivery and the local development preview
- `db` — SQL queries and migrations
- `api/openapi.yaml` — API contract
