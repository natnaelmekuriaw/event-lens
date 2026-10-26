# Security

EventLens provides account/project management, durable event collection, analytics,
conversion paths, and daily retention. Release verification also includes recovery
and deployment qualification; execution evidence must pass for the release revision.

## Reporting an issue

Report a suspected vulnerability privately to the repository maintainer. Use the
repository's Security advisory reporting option if enabled. Otherwise ask for a
private reporting channel without posting exploits, credentials, or personal data
in a public issue. Include affected revision, reproduction, expected/actual
behavior, and impact using synthetic examples.

## Accounts and tenant boundaries

- First-owner creation requires BOOTSTRAP_TOKEN and closes after initialization.
- Signup is disabled. Owners privately share email-specific invitations.
- Invitation hashes expire after 48 hours and are consumed once; replacement
  invalidates the previous link. Existing accounts must authenticate first.
- Management requests require sessions, workspace membership, and applicable roles.
- Only owners manage invitations/membership roles; each workspace keeps an owner.
- Owners/admins edit projects, rotate ingestion keys, and replay retained failures.
  Viewers read authorized projects/events and processing status.
- Public project keys grant write-only ingestion access, without event read or
  management permissions. Raw keys are shown once and only hashes are stored.

Passwords must be 12–128 characters. Signed-in users can change their password.
Email verification and email password reset are not implemented. A privileged
[operator recovery command](docs/release-operations.md#recover-an-existing-account)
replaces an existing credential and revokes that account's sessions. Stop API
traffic before recovery. An invitation does not reset an existing account's password.

## Untrusted event data

Public keys are intended for browser exposure and do not prove event authenticity.
A copied key can submit synthetic data into that project. Rotate a compromised key,
apply proxy admission limits, and use analytics rather than this pipeline for
financial, audit, or authorization records.

Ingestion validates bounded JSON and entire batches, enforces timestamp windows,
and deduplicates project/event IDs. Identity is untrusted event context; it never
grants account access. Conflicting associations are flagged and do not replace
the first stored link. Never send passwords, tokens, payment data, or sensitive
personal information as properties or actor IDs.

The SDK does not automatically capture DOM, URLs, IPs, user agents, or fingerprints.
Browser localStorage stores an anonymous ID and opt-out preference only.
Opt-out clears queued client data and aborts delivery; it cannot delete already
accepted events. Node clients require explicit actor context and should not be
shared across unrelated requests.

## Operating an installation

Use HTTPS and a reverse proxy. Keep PostgreSQL, Redis, and worker health private.
Expose only the ingestion route from the API if serving it directly; management
normally uses the dashboard's same-origin proxy. The local Compose listeners bind
to loopback; a remote deployment needs authenticated/TLS Redis or a trusted
private network and equivalent database controls.

Generate separate secrets per installation. Protect .env, backups, and invitation
links. Keep tokens, passwords, session cookies, project keys, actor identifiers,
and properties out of application/proxy logs. Event payloads remain in PostgreSQL;
BullMQ jobs contain receipt IDs and replay generations. Session IP and user-agent
metadata are not persisted by the application.

Admission counters are held in each API process. Run one API instance and configure
proxy limits; multiple replicas need shared admission state. The socket-based
mutation limiter can group callers behind a proxy, so account for that when
setting topology and traffic limits.

Analytics retention defaults to 90 days by server receipt time. Failed payloads
expire after 14 days; pending work is retained. Minimal receipt tombstones persist
for deduplication. This does not implement complete actor erasure or a regulatory
compliance policy; backups and deployment logs need their own policy.

Application container packaging and operator recovery are implemented; their
acceptance checks run in the single verification flow. Complete actor erasure,
enterprise identity recovery, and measured production capacity remain outside the
current claims. Four concurrent report slots and database/query time budgets bound
analytics load; a short client timeout does not imply all server work is free.
See [release operations](docs/release-operations.md), [self-hosting](docs/self-hosting.md),
and [event operations](docs/events.md).
