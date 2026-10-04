import test from "node:test";
import assert from "node:assert/strict";
import { rerankWithScorer, cachedLoader } from "../lib/rag/reranker";
import type { SearchResult } from "../lib/rag/types";
const candidates: SearchResult[] = [1, 2, 3].map(i => ({id: String(i), content: `content${i}`, score: 1 / i, metadata: {source: "projects.md", section: `Section${i}`, type: "project"}}));
test("reranker: count, IDs, metadata, original scores/ranks, stable ties and truncation", async () => {
  const result = await rerankWithScorer("query", candidates, async (query, docs) => {
    assert.equal(query, "query"); assert.deepEqual(docs, candidates.map(c => c.content)); return [1, 3, 3];
  }, 2);
  assert.deepEqual(result.map(r => r.id), ["2", "3"]);
  assert.equal(new Set(result.map(r => r.id)).size, 2);
  assert.deepEqual(result.map(r => r.originalRank), [2, 3]);
  result.forEach(r => {assert.deepEqual(r.metadata, candidates[r.originalRank - 1].metadata); assert.equal(r.score, candidates[r.originalRank - 1].score); assert.ok(Number.isFinite(r.rerankScore));});
  assert.equal(candidates[0].id, "1");
});
test("reranker: empty / single candidate and invalid inputs", async () => {
  assert.deepEqual(await rerankWithScorer("", [], async () => {throw new Error("must not load");}), []);
  assert.equal((await rerankWithScorer("", candidates.slice(0, 1), async () => [-3], 5))[0].originalRank, 1);
  await assert.rejects(rerankWithScorer("", candidates, async () => [NaN, 1, 2]));
  await assert.rejects(rerankWithScorer("", candidates, async () => [1]));
  await assert.rejects(rerankWithScorer("", [candidates[0], candidates[0]], async () => [1, 2]));
  await assert.rejects(rerankWithScorer("", candidates, async () => [1, 2, 3], 0));
});
test("reranker: cached loader reuses instance concurrently; failed initialization retries", async () => {
  let calls = 0;
  const singleton = {};
  const load = cachedLoader(async () => {calls++; return singleton;});
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, singleton); assert.equal(a, b); assert.equal(await load(), a); assert.equal(calls, 1);
  let attempts = 0;
  const retry = cachedLoader(async () => {if (++attempts === 1) throw new Error("init"); return singleton;});
  await assert.rejects(retry()); assert.equal(await retry(), singleton); assert.equal(attempts, 2);
});
