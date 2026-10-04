# Open-source release checklist

Review the sanitized release produced by pnpm release:export before creating the first commit. Never force-add ignored private material.

- [x] Reviewed source contains no detected credential; .env.local excluded without reading it
- [x] No private knowledge or generated index in the public source allowlist
- [x] No private evaluation / failure traces in the public source allowlist
- [x] No detected local identity/path or screenshots in the public source allowlist
- [x] No model weights or cache in the public source allowlist
- [x] Tests, typecheck, lint and build pass in a fresh copy
- [x] Model preparation from verified cache, ingestion and example retrieval verified (first network download remains unverified)
- [x] MIT license and third-party notices present
- [ ] Review git diff --cached --name-only and scan staged content before committing
- [ ] Enable private security reporting before public release

No repository is created, committed or pushed by these scripts. .gitignore is defense in depth; the export allowlist is the publication boundary. Check the final audit report for actual validation outcomes.
