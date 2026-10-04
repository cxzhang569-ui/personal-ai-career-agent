# Anonymous retrieval benchmark

Historical small manually labeled project-specific benchmark; not comparable to public IR model benchmarks. No queries, chunk text, personal facts or raw traces are published. Fictional demo labels are separate and cannot reproduce these results.

Graded Vector: 25 positive / 5 unknown questions. Primary Hit@1 52%, Hit@3 64%, Hit@5 68%, MRR@5 .588. Relevant Hit@1 88%, Hit@3 92%, Hit@5 96%, MRR@5 .9013. Primary Candidate Recall@20 95.45% over 22 queries with primary labels. Unknown rejection was not evaluated.

BM25 / Hybrid RRF improved some Top-K recall but did not improve Hit@1 enough to replace Vector. Those comparisons used earlier exact labels, so their scores should not be directly compared with graded metrics.

Knowledge organization audit reduced high-similarity cross-file pairs from 29 to 4; historical exact-label Hit@1 changed from 68% to 76%. This was not the graded Primary Hit@1 definition. It supports investigating topic ownership, not a causal proof or general model result.

Public commands evaluate only synthetic labels and write results to ignored .cache/evaluation/. Reliable unknown detection remains future work.
