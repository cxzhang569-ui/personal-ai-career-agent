# Contributing

Fork the repository and create a focused branch. Follow README installation instructions. Use fictional fixtures; never include private profiles, keys or conversation logs.

Run pnpm test, pnpm typecheck, pnpm lint, pnpm build and pnpm release:audit before proposing a PR. Explain the behavior change and validation. Model tests are optional integration checks, enabled with RUN_MODEL_TESTS=true after preparing the local model and example index. Do not call paid APIs from CI.
