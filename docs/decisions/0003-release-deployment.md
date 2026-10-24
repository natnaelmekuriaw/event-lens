# Release deployment and verification

## Context

The release audit found that verification could migrate the configured application
database and that globally named Compose volumes could join independent installs.
Recovery and deployment needed acceptance against the packaged application.

## Decision

- Support one API, one worker, one dashboard, PostgreSQL 17, Redis 8, and Caddy on
  one Docker host. Retain source deployment as an operator-managed alternative.
- Require explicit existing external database/Redis volumes for deployment.
  Document old-volume inspection and fresh-volume creation as separate procedures.
- Give verification its own generated Compose project, credentials, databases,
  Redis instance, private configuration file, and disposable volumes. Never load
  the application's `.env` during that flow.
- Keep required checks ordered in `scripts/verify.mjs`, with modules for process
  management, restore/upgrade, container acceptance, and workload evidence.
- Recover only existing credential accounts through an interactive privileged
  command, with password replacement and session revocation in one transaction.
- Evaluate reports on repeatable-read snapshots, limit concurrency to four per
  API process, and bound statement, transaction, and browser request lifetimes.
- Record candidate workloads and actual revision-linked results separately.
  Runtime acceptance remains the owner's execution responsibility.

## Consequences

Existing operators must select inspected volume names before using the new Compose
configuration. Verification needs Docker, browser/package downloads, and unoccupied
application/HTTPS test ports; it takes longer because it exercises actual packaging
and recovery. Interrupted cleanup retains a private file for the generated project.

Images retain workspace build dependencies for migrations and recovery, so the
dependency gate covers all shipped JavaScript tooling. Restore uses a fresh target;
automatic rollback of arbitrary nontransactional migrations is not supported.
Four report slots and socket-based admission assume a single API instance and need
redesign before scaling. No production throughput promise follows from synthetic
local measurements alone.
