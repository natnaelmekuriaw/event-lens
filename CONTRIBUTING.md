# Contributing

Discuss the change before implementing it. Agree on each stage's scope, branch,
expected outcome, and approximate commit count. Record meaningful decisions in
`docs/decisions` and keep the phase plan current. Commit estimates guide review;
never add churn or split a coherent change to meet a count.

Use strict TypeScript, clear names, small responsibilities, and concise comments
that explain decisions. Share validation and response contracts through
`packages/contracts`. Keep authorization in the API and scope every project query
to its workspace. Add modules when they make responsibilities clearer.

## Branches and commits

Use lowercase branch names with hyphens: `feat/descriptive-name` for features and
`fix/descriptive-name` for fixes. Phase 1 uses `feat/project-setup`.

Commit coherent, reviewable changes with short lowercase subjects. Add the
following trailer selectively to critical implementation commits and important
fixes:

```text
Co-authored-by: nasho-x <174001652+nasho-x@users.noreply.github.com>
```

Keep repository attribution human. Do not add assistant or tool credits,
signatures, generated-by notices, or assistant co-author entries to files,
commits, branches, pull requests, or repository metadata.

## Checks and handoff

Maintain `scripts/verify.mjs` as the single ordered verification entry point. It
must show progress and stop on failure. Add checks there when a change introduces
a new required verification step. Use meaningful tests for behavior and tenant
boundaries; avoid tests that only repeat implementation details.

Full verification runs Docker, database migrations, the complete test suite, and
applicable benchmarks. Focused offline checks may be used during implementation.
Do not report unexecuted checks as passing. Push only after the stage is verified.

Each completed stage report must include:

- What changed and its expected behavior.
- Branch name and actual commit count.
- Checks run, their results, and remaining limitations.
- Checks awaiting the owner's execution.
- The single full verification command: `pnpm verify`.

Keep secrets, local `.env` files, database dumps, test output, and dependency
folders out of commits. Document setup or behavior changes alongside the code.
