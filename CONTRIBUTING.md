# Contributing

Bug reports, feature proposals, and PRs are all welcome.

## Development setup

- Node.js 20 or later
- Clone the repository, then:

```bash
npm install
npm run build    # tsc -> dist/
npm test         # build + unit/integration tests
npm run check    # typecheck only
npm run pack:check   # npm pack --dry-run
```

## Workflow for changes

1. For large changes, open an issue first to discuss.
2. Create a branch and do the work.
3. Make sure `npm test` passes. If you changed behavior, add a case to
   `tests/` covering it.
4. Open a PR describing why the change exists and how you verified it.
   The template appears automatically.

## Code conventions

- TypeScript strict mode stays on.
- ESM: `import ... from "./x.js"` — always include the `.js` extension
  (required by `moduleResolution: NodeNext`).
- Public API is exported only from `src/index.ts`. Do not deep-import
  internal modules.
- Architecture map: [docs/architecture.md](docs/architecture.md).

## Commits / PRs

- Commit messages: what + why in one line. No enforced format.
- CI runs `ci` (typecheck + tests on Node 20/22/24, packed-tarball smoke)
  and the `action-bundle` workflow on every push — the workflow itself is
  this project's dogfood.

## Testing workflows safely

The `action-bundle` workflow is triggered on push. To experiment without
spamming runs, push to a branch or use `workflow_dispatch` from a fork.

## Security issues

Do not open public issues for vulnerabilities — follow
[SECURITY.md](SECURITY.md).

