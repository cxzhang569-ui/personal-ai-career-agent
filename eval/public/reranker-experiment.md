# Anonymous reranker experiment

Vector Top-20 → BAAI/bge-reranker-base cross-encoder (Xenova ONNX Q8, CPU) → Top-5. Embedding, dataset and labels were held fixed.

| Metric | Vector | Reranked |
|---|---:|---:|
| Primary Hit@1 | 52% | 64% |
| Primary Hit@3 | 64% | 76% |
| Primary Hit@5 | 68% | 80% |
| Primary MRR@5 | .588 | .708 |
| Relevant Hit@5 | 96% | 100% |

Small manually labeled project-specific benchmark; not general model benchmarking. Private labels/traces are excluded, so the published demo does not reproduce historical scores. Warm CPU reranking was approximately 855 ms for Top-20 in the earlier experiment; this is hardware-specific, not a latency guarantee.

Candidate-N Pareto tested only 5/10/15/20 with final Top-5. In that run Top-20 was dominated by Top-15 on Primary Hit@1, MRR and mean reranker latency. This offline recommendation did not enable production reranking. Real E2E showed added latency without enough demonstrated user-facing benefit; RERANKER_ENABLED=false remains the default.
