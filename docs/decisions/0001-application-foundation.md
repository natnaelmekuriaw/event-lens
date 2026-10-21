# 0001: Application foundation

Status: accepted for Phase 1.

Use strict TypeScript, pnpm workspaces, NestJS, Next.js, PostgreSQL, and Prisma.
Use a maintained authentication library (Better Auth) for password hashing and
session lifecycle. Keep workspace authorization in application services, where
the tenant boundary is explicit and testable.

Use Prisma 7 because Better Auth's Prisma adapter requires Prisma Client; Prisma 8
has a different runtime. Pin compatible releases and the lockfile rather than
adopting an incompatible major version solely because it is newer.

Bootstrap requires a high-entropy operator token and is serialized in PostgreSQL.
Public signup is always disabled. Workspace owners can create expiring invitation
links for new accounts; no email delivery service is required for this first phase.
Invitation links are secrets and must be shared privately.

Use same-origin dashboard API proxying to simplify cookies and browser deployment.
Production requires HTTPS at a reverse proxy. A single API replica is the initial
deployment model; distributed abuse controls arrive with ingestion infrastructure.

References:

- [Better Auth installation](https://better-auth.com/docs/installation)
- [Prisma and Better Auth](https://www.prisma.io/docs/guides/authentication/better-auth/nextjs)
