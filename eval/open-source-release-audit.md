# Open-source release audit

Date: 2026-10-03. Scope: source packaging and local reproducibility only. No GitHub repository, commit, push or public deployment was created.

## Sanitization Summary

Status: **Ready for a public source repository from the reviewed sanitized export.** Do not upload the entire private working directory. The publication allowlist is implemented in scripts/oss-release.mjs; .gitignore is defense in depth. Use release:audit / release:export and review the actual first staged commit.

The six original root knowledge Markdown files and the original generated index remain local and unchanged (7/7 SHA-256 matches against the existing protected-file snapshot). Thirty-six historical report/dataset/image files were retained under ignored eval/private/. Unpublished historical validation scripts remain local. There is no existing Git history to inspect.

## Secrets Audit

No high-confidence credential findings in 152 reviewed source text files or the final public allowlist. Scans covered credential patterns and reviewed API/key/Bearer/Authorization/token occurrences; functional SDK calls, placeholders and synthetic test credentials are not real keys. Findings contain only filenames, line numbers and risk types, never matched values.

The original .env.local was **not read or displayed**. Therefore this audit makes no claim about its values. Its exclusion was verified using Git's actual ignore engine in an isolated temporary repository. No private index, root knowledge, cache, model weights, local usernames or personal absolute paths are included in the export. No screenshots are published; public/ contains only .gitkeep.

Scanning is heuristic, not a proof that every possible secret format is absent. Human review of git diff --cached remains required before a first commit.

## Public Example Data

Six completely fictional Alex Chen files use Campus Study Assistant, Document QA Tool and AI Notes Search. Default KNOWLEDGE_DIR is knowledge/example; private users may configure ignored knowledge/local or knowledge/private. Ingestion in the clean copy created **13/13 normalized 512-dimensional vectors** with retained content/source/section/metadata and no duplicate IDs. Generated data/embeddings.json is ignored and excluded from the source export.

Three real local BGE retrieval checks passed:

| Query | Required section found in Top-5 |
|---|---|
| Campus Study Assistant solves what problem? | Campus Study Assistant — Overview |
| Campus Study Assistant RAG flow | Campus Study Assistant — Architecture |
| Python practice | Python |

The public evaluation dataset contains 9 positive and 1 unknown synthetic questions. Demo Vector Primary/Relevant Hit@1 = 77.78%, Hit@3/5 = 100%, MRR@5 = 0.8889, source recall = 100%. These easy fictional examples do not reproduce or validate private historical benchmark scores. Unknown detection is not evaluated. Public Vector, BM25/Hybrid comparison and candidate recall commands completed without generation API calls.

## README, License and CI

README now explains architecture, quick start, private knowledge setup, generated artifacts, model preparation, optional evaluation, Docker, privacy, limitations and engineering tradeoffs. Historical public summaries contain only anonymous aggregates, with explicit benchmark denominators and limitations. The 68% → 76% earlier KB-audit result is described as exact-label Hit@1, not retroactively renamed Primary Hit@1.

MIT source license, CONTRIBUTING, SECURITY, checklist and third-party notices added. Direct dependencies declare MIT / Apache-2.0. BAAI model cards declare MIT; ONNX conversion cards do not independently declare a separate license. Verify applicable notices before redistributing model weights or prepared images. Source export includes only the fixed revision/checksum manifest, not weights.

GitHub Actions runs frozen install, offline tests, typecheck, lint, build and release audit with no DeepSeek secret, model preparation or private data. Its equivalent checks were run locally in a clean copy; hosted Ubuntu Actions has not run because no repository was published.

## Reproducibility

Fresh sanitized copy: pnpm frozen install passed; model-free tests **69 passed, 2 optional integration tests skipped, 0 failed**; typecheck, lint and build passed with no real key, index, model or private KB present. After BGE preparation and example ingestion, opt-in real-model tests **71 passed, 0 skipped, 0 failed**. Final updated public source tests/typecheck/lint also passed. Original workspace final build passed.

Model preparation and verification validated five pinned artifacts (95,170,666 bytes), revision 9507db33464b5da99a532ac26b2a251767cbc62b. First remote download failed in this environment. The successful preparation used existing local model artifacts copied into the new copy's preparation cache, followed by full checksum verification. This verifies preparation/inference, **not a successful cold network download**. The source export has no cache or weights.

The clean copy used a new environment file copied only from .env.example, with a placeholder key. Its local page opened successfully in a real browser, displayed fictional Alex Chen, and returned HTTP 200. No real DeepSeek request was made in this task. The temporary server was stopped after validation.

## Remaining Risks

- **P0: none identified for publishing the reviewed source export.** This is not deployment approval or a guarantee against undetectable secret formats.
- **P1:** verify cold Hugging Face downloads on a connected new machine; run hosted Linux CI and the revised example Docker build; clarify conversion redistribution notices before distributing prebuilt model-containing images; enable GitHub private security reporting and review the first staged commit. Docker configuration was reviewed but the revised image was not built in this task.
- Existing application limitations remain: incomplete unknown rejection, possible incorrect LLM output, single-process rate/concurrency state and experimental reranking. RERANKER_ENABLED remains false by default.

## Changed / Added Files

Packaging/config: .gitignore, .dockerignore, .env.example, package.json, tsconfig.json, eslint.config.mjs, next.config.ts, Dockerfile, config/profile.ts, lib/rag/knowledge.ts.

Documentation/CI: README.md, LICENSE, CONTRIBUTING.md, SECURITY.md, THIRD_PARTY_NOTICES.md, OPEN_SOURCE_CHECKLIST.md, .github/workflows/ci.yml, knowledge/README.md, data/.gitkeep, public/.gitkeep.

Examples/evaluation: six knowledge/example Markdown files, eval/public/example-rag-eval.json, eval/public/retrieval-benchmark.md, eval/public/reranker-experiment.md, eval/public/system-evaluation.md, scripts/evaluate-public.ts, scripts/check-example.ts, scripts/oss-release.mjs, this report and its JSON companion.

Tests: tests/agent.test.ts, tests/embed.test.ts, tests/retrievers.test.ts, tests/streaming.test.ts, tests/fixtures/knowledge.ts, tests/oss.test.ts. Historical eval artifacts moved into ignored eval/private/. Temporary validation helpers/logs/copies remain only in ignored .cache/.

## Answers to the 45 Release Questions

1. Real API key found? No detected hardcoded real key in reviewed source; original environment values were not inspected.
2. .env.local ignored? Yes, verified with git check-ignore, excluded by export and Docker context.
3. Suspected secret leak? No high-confidence finding in reviewed public source; heuristics still require human staged review.
4. Existing Git history? No existing Git history.
5. Sensitive Git history? Not applicable; no history exists.
6. Private exclusions? Root KB, indexes, env files, historical eval, chats/traces/images, private scripts, caches, logs, model weights and generated builds.
7. Real KB handling? Retained unchanged locally, ignored, no longer default, excluded from export.
8. Example KB complete? Yes, all six files.
9. Fully fictional? Yes, fictional Alex Chen and invented projects/education/practice.
10. Index ignored? Yes, all data artifacts except .gitkeep.
11. Personal chunk text submitted? No, only fictional example Markdown; no index is exported.
12. eval/private? 36 historical artifacts retained there, ignored and not exported.
13. Public reports? retrieval-benchmark, reranker-experiment, system-evaluation and sanitized release audit.
14. README complete? Yes.
15. Architecture? Mermaid diagram included.
16. Evaluation story? Baseline through E2E progression included.
17. Tradeoffs? Local BGE, JSON, persistent Node and default-off reranking explained.
18. Quick start verified? Install/checks, cache-assisted model preparation, ingest, retrieval and browser page passed; cold network download did not pass.
19. model:prepare usable? Passed from verified cache; remote access is a remaining prerequisite.
20. Example ingestion? Passed, 13/13 vectors.
21. Example retrieval? Passed three queries and public evaluation.
22. MIT? Added.
23. CONTRIBUTING? Added.
24. SECURITY? Added, no invented contact address.
25. Actions? Added, not yet hosted-run.
26. CI without DeepSeek key? Yes; local clean-copy equivalent checks passed without a real key.
27. CI without private KB? Yes, synthetic fixtures only.
28. Tests contain private information? Reviewed public fixtures use synthetic content; no private source or chat text included.
29. Personal Windows absolute paths? None detected in exported files.
30. Local username leakage? None detected in exported files.
31. Weights excluded? Yes, only manifest published.
32. Cache excluded? Yes.
33. Browser/public inspected? Public assets inspected; only .gitkeep exported; fictional page opened in browser.
34. Sensitive screenshots? Local old screenshots excluded; no screenshots published.
35. Fresh install? Frozen-lockfile installation passed.
36. Tests? 69 model-free passes + 2 optional skips; real-model run 71/71 passed.
37. Typecheck? Passed.
38. Lint? Passed.
39. Build? Clean-copy no-model build and original final build passed.
40. Fresh clone equivalent? Passed local source-copy install/checks; no private artifacts copied.
41. Public GitHub ready? Yes, reviewed sanitized source only; no push performed.
42. Remaining P0? None identified for source publication.
43. P1? Cold download, hosted CI/revised Docker, image redistribution notices and first staged review/security reporting.
44. Changed files? Listed above; private records retained locally.
45. First commit contents? Only publication manifest allowlisted source/docs/config/example/tests/public summaries. Review actual staged contents; never force-add ignored files. Do not commit env, indexes, model artifacts, cache or private eval.
