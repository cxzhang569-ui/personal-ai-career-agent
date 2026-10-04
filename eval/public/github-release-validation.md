# GitHub release validation

Validation date: 2026-10-04. Scope: sanitized source publication only; no deployment or real generation API calls.

## Repository and initial commit

- Repository: https://github.com/cxzhang569-ui/personal-ai-career-agent
- Visibility: public; default branch: main; license detected by GitHub: MIT.
- Initial commit: `0e8f233d6ccad30d1d6d936f1fc6c0a34610e373`.
- Initial message: `feat: initial open-source release`.
- Documentation commit: `e2d310ce34789118d08a57b90c85a3cabd75abb9` (`docs: finalize GitHub repository links`).
- All Git mutations were performed in the reviewed public-source copy. The original private project was not used as the repository or changed.
- Initial staged scan: 108 files, 400,478 bytes; largest file: pnpm-lock.yaml, 157,509 bytes. No files over 50 MiB.
- Staged blobs, staged diff, publication allowlist and private-path exclusions passed review. No real credentials or private local paths were found. Environment secrets were not read.

## CI

Both published commits completed successfully on GitHub Actions:

- Initial commit: https://github.com/cxzhang569-ui/personal-ai-career-agent/actions/runs/37170380363
- README commit: https://github.com/cxzhang569-ui/personal-ai-career-agent/actions/runs/37170380444

The GitHub jobs API confirms success for installation, tests, typecheck, lint, build and release audit on Ubuntu. CI uses no DeepSeek secret and does not prepare/download model weights. Individual hosted test counts could not be independently read: downloading logs returned HTTP 403. The equivalent fresh-clone suite reports 71 tests, 69 passed, 2 optional model tests skipped, 0 failed. These are local counts, not claimed hosted-log counts.

## Fresh clone and Quick Start

A new clone was fetched from the actual public GitHub URL, with no copied private knowledge, environment file, model cache or index.

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed |
| Tests | 71 total; 69 passed; 2 optional model tests skipped; 0 failed |
| Typecheck | Passed |
| Lint | Passed |
| Build | Passed; home, chat API and health API built |
| model:prepare | Passed, first model download: 5 files / 95,170,666 bytes |
| model:verify | Passed |
| Example ingestion | 13/13 chunks, normalized 512-dimensional vectors |
| Example retrieval | Passed, three independent example queries |
| Generated index | Ignored and untracked; working tree clean |

Model revision: `9507db33464b5da99a532ac26b2a251767cbc62b`. First download required the machine's existing network proxy, enabled only for the verification process. This is an environment requirement; model code was not changed.

Example retrieval returned:

| Query | Returned sections |
| --- | --- |
| Campus Study Assistant 解决什么问题？ | Overview; Challenges; Representative Project; Architecture; Career Direction |
| Campus Study Assistant 的 RAG 流程是什么？ | Representative Project; Architecture; Overview; Challenges; RAG |
| Python 实践 | Python; Background; Learning Practice; RAG; Architecture |

The example data is fictional and these checks do not establish real-candidate retrieval quality. Reranker remains disabled by default.

## Remote content and privacy

- Remote tree and fresh-clone tracked content contain the reviewed 108 source files before this report, with no secret files, private knowledge, private evaluations, private index, cache, model weights, screenshots or build output.
- Only the six fictional knowledge/example Markdown files are included as candidate knowledge. Public evaluation summaries are sanitized.
- Private environment, knowledge, evaluation, generated index, cache and model paths are ignored. The newly generated example index stayed ignored.
- SECURITY.md and CONTRIBUTING.md are accessible through GitHub's contents API. No issue/PR templates are present; this is optional.
- About description and ten requested topics were configured. Website is blank; social preview remains default. No releases or images were published.
- Private vulnerability reporting was observed disabled; enabling it is an optional follow-up.
- GitHub reports repository size as 0 KiB while its statistics are pending. This is not an empty repository: the fresh clone's Git pack is 154,411 bytes (about 151 KiB), and initial source blobs total about 391 KiB.

## README validation and limitations

The actual GitHub rendered README HTML was retrieved through GitHub's API. Title, table markup, code blocks and Mermaid source markup are present. Real clone URL, architecture, features, quick start, evaluation results and engineering decisions are present in source, and relative documentation targets exist.

Visual browser verification remains incomplete: repeated in-app browser navigation timed out and the returned tab could not be attached. Mermaid visual rendering and the badge image therefore must not be reported as visually verified. GitHub code search returned HTTP 401, and raw-host probes failed at the connection layer (no HTTP response); they are not claimed as 404 checks. The remote tree and fresh-clone full-content privacy scan provide direct alternative evidence of exclusion.

After the successful pushes, the local GitHub CLI authentication subsequently returned HTTP 401. Refresh is required to publish this report and retrieve restricted CI logs. No password or token was requested or printed.

## Remaining work

- No identified source/privacy/build P0. Final release acceptance remains incomplete pending report push and browser visual README/Mermaid/badge verification.
- P1: model download network availability; use the appropriate existing proxy where needed. Cold download succeeded here.
- Optional: enable private vulnerability reporting and basic main protection; add templates or a social preview later if desired.
- A portfolio link can point to the published source, with the current verification limits disclosed. Complete outstanding acceptance before calling every release check passed.
- Consider a separate v0.1.0 source release after those checks; do not call this production 1.0. No deployment was performed.

## Requested 50-item checklist

1. Name: personal-ai-career-agent.
2. URL: repository link above.
3. Public: yes, GitHub API confirmed.
4. Git source: reviewed public-source copy only.
5. Original private project used for Git publication: no.
6. Initial hash: full hash above.
7. Initial message: above.
8. Staged scan: safe.
9. Real API key found: no.
10. Private environment file tracked: no.
11. Private knowledge tracked: no.
12. Private embeddings tracked: no.
13. Private evaluation tracked: no.
14. Model weights tracked: no.
15. Cache tracked: no.
16. Tracked files above 50 MiB: none.
17. Private Windows paths found: none.
18. Local username leakage found: none.
19. Initial and README pushes: successful; report push pending renewed authentication.
20. Main: published normally, no history rewriting.
21. Actions ran: yes, two runs.
22. CI passed: yes, both published commits.
23. Hosted test count: not independently available; local equivalent 71 / 69 passed / 2 skipped.
24. Typecheck: passed locally and CI step success.
25. Lint: passed locally and CI step success.
26. Build: passed locally and CI step success.
27. README: rendered HTML checked; visual check incomplete.
28. Mermaid: source markup checked; visual check incomplete.
29. Badge: URL configured; image visual check incomplete.
30. License: MIT detected.
31. Security: present and accessible.
32. Contributing: present and accessible.
33. Example knowledge: fictional only.
34. Public evaluation: sanitized.
35. GitHub fresh clone: successful.
36. Fresh installation: successful.
37. Fresh tests: passed, 2 optional skips.
38. Fresh build: passed.
39. Model preparation: successful cold download.
40. Model verification: passed.
41. Example ingestion: 13/13 successful.
42. Example retrieval: three queries passed.
43. Generated index: ignored/untracked.
44. Remote privacy: tree and cloned content passed; webpage visual check incomplete.
45. Size: approximately 151 KiB Git pack; GitHub size statistics pending.
46. Portfolio use: suitable source link with remaining validation caveats.
47. Remaining P0: none identified in published source; acceptance tasks still outstanding.
48. P1: cold-download network availability; optional repository settings.
49. Later v0.1.0: reasonable after outstanding acceptance.
50. Public changes this phase: README.md (real URL and badge), this validation report; initial reviewed source was published unchanged.
