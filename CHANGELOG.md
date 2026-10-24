# Changelog

## Unreleased

- Package API, worker, dashboard, migrations, and HTTPS proxy for a single Docker host.
- Add interactive operator password recovery with session revocation.
- Keep report pages on a consistent snapshot and bound report concurrency and runtime.
- Preserve dashboard request deadlines when callers supply cancellation signals.
- Bound process shutdown and expose pending/expired event age on worker readiness.
- Make verification use disposable infrastructure, with restore, upgrade, dependency
  loss, historical workload, and sustained ingestion rehearsals in one command.
- Retain revision-linked measurements and synthetic dashboard screenshots in CI.

### Upgrade requirement

Set `EVENTLENS_POSTGRES_VOLUME` and `EVENTLENS_REDIS_VOLUME` to the inspected,
existing deployment volume names before using the new Compose configuration.
New installations create unique external volumes explicitly. Follow
[deployment and recovery](docs/release-operations.md) before changing deployment
storage or applying migrations. Never create replacement volumes during an upgrade.

The release version and supported workload will be finalized after the owner
executes verification and reviews the generated evidence. Publishing is pending.
