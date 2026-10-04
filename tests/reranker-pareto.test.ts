import test from "node:test";
import assert from "node:assert/strict";
import { candidateSizes, createRerankerExperiment } from "../lib/rag/reranker-pareto-experiment";
import { cachedLoader, rerankWithScorer } from "../lib/rag/reranker";
import { paretoFrontier, statistics } from "../eval/reranker-pareto-metrics";

test("all fixed candidate sizes preserve metadata, original ranks and fixed final five; reuse scorer cache", async () => {
  let loads = 0;
  const load = cachedLoader(async () => { loads++; return (documents: string[]) => documents.map(Number); });
  const run = createRerankerExperiment({
    search: async (_, n) => Array.from({length: n}, (_, i) => ({id: String(i), content: String(i), score: 1 / (i + 1), metadata: {source: "projects.md", section: String(i), type: "project"}})),
    rerank: (query, rows, n) => rerankWithScorer(query, rows, async (_, docs) => (await load())(docs), n),
  });
  for (const n of candidateSizes) {
    const result = await run("query", {candidateTopN: n, finalTopK: 5});
    assert.equal(result.candidates.length, n); assert.equal(result.ranked.length, n); assert.equal(result.final.length, 5);
    assert.equal(result.final[0].originalRank, n);
    assert.deepEqual(result.final[0].metadata, result.candidates[n - 1].metadata);
    assert.equal(result.final[0].score, result.candidates[n - 1].score);
    assert.ok(result.latency.totalMs >= result.latency.rerankMs);
  }
  assert.equal(loads, 1);
  for (const n of [0, 4, 8, 12, 25, NaN]) await assert.rejects(run("query", {candidateTopN: n, finalTopK: 5}));
  await assert.rejects(run("query", {candidateTopN: 10, finalTopK: 3}));
});

test("Pareto dominance requires all objectives non-worse and at least one strict improvement", () => {
  const result = paretoFrontier([
    {name: "10", primaryHit1: .64, primaryMRR: .7, rerankMeanMs: 400},
    {name: "20", primaryHit1: .64, primaryMRR: .7, rerankMeanMs: 800},
    {name: "15", primaryHit1: .6, primaryMRR: .72, rerankMeanMs: 600},
  ]);
  assert.deepEqual(result.frontier, ["10", "15"]);
  assert.deepEqual(result.dominated, [{name: "20", dominatedBy: ["10"]}]);
  assert.deepEqual(statistics([1, 2, 3, 4]), {sampleCount: 4, meanMs: 2.5, p50Ms: 2, p95Ms: 4});
});
