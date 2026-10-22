# Security

EventLens is under active development. Phase 1 implements account, workspace,
and project management. Analytics ingestion and production recovery workflows
are not available yet.

## Reporting an issue

Report a suspected vulnerability privately to the repository maintainer. Use the
repository's Security advisory reporting option if it is enabled. Otherwise ask
for a private reporting channel without posting the exploit, credentials, or
personal data in a public issue.

Include the affected revision, reproduction steps, expected and actual behavior,
and impact. Use disposable accounts and synthetic data in examples.

## Current boundaries

- First-owner creation requires `BOOTSTRAP_TOKEN` and closes after initialization.
- Public signup is disabled. An owner creates invitations for a particular email.
- Invitation tokens expire after 48 hours, are stored as hashes, and are consumed
  on acceptance. A replacement invitation invalidates the previous link.
- Existing accounts must sign in with the invited email before accepting a link.
- Management endpoints require sessions and enforce workspace roles. Public
  project keys grant no management access.
- Only owners manage invitations and membership roles. At least one owner must
  remain in each workspace.
- Owner and admin roles can create and edit projects and rotate project keys.
  Viewers can read projects and settings.

Passwords must be 12–128 characters. Authenticated users can change their
password. Email verification, email password reset, and an operator password
recovery procedure are not implemented. Plan account access accordingly; an
invitation does not reset an existing account's password.

## Operating an installation

Use HTTPS for the dashboard and expose it through a reverse proxy. Keep API and
PostgreSQL listeners private, and restrict access to backups and `.env`. Generate
separate secrets for every installation. Do not include bootstrap tokens,
passwords, session cookies, invitation links, or database credentials in logs or
issue reports.

Phase 1 abuse controls use process memory. Run a single API instance and apply
appropriate proxy limits; multiple replicas require shared abuse-control state
before deployment. This foundation does not establish performance or security
claims for a production analytics workload.

Project keys are reserved for future browser event ingestion. Rotation replaces
the active key immediately. Treat invitation links as account-access secrets and
share them privately even though their token is kept in the URL fragment.

See [self-hosting](docs/self-hosting.md) for deployment and backup guidance.
