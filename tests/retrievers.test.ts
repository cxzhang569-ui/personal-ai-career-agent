import test from "node:test";
import assert from "node:assert/strict";
import { createBM25, searchBM25, tokenizeBM25 } from "../lib/rag/bm25";
import { reciprocalRankFusion, searchHybrid } from "../lib/rag/hybrid";
import { searchVector } from "../lib/rag/vector-experiment";
import { loadKnowledgeIndex, searchKnowledgeBase } from "../lib/rag/search";
import type { KnowledgeChunk, SearchResult } from "../lib/rag/types";

const chunk = (id: string, content: string): KnowledgeChunk => ({ id, content, metadata: { source: `${id}.md`, section: id, type: "test" } });
const ranked = (id: string): SearchResult => ({ ...chunk(id, `内容 ${id}`), score: 0.8 });

test("BM25 tokenizer: Chinese words, lowercased technical entities and punctuation removal", () => {
  const tokens = tokenizeBM25("中文检索。RAG PageIndex DeepSeek Transformer Python Embedding AI Agent！");
  assert.ok(tokens.some(token => /\p{Script=Han}/u.test(token)));
  for (const term of ["rag", "pageindex", "deepseek", "transformer", "python", "embedding", "ai", "agent"]) assert.ok(tokens.includes(term));
  assert.ok(tokens.every(token => /^[\p{L}\p{N}]+$/u.test(token)));
  assert.deepEqual(tokenizeBM25("！ / -"), []);
  assert.deepEqual(tokenizeBM25("Ｐｙｔｈｏｎ"), ["python"]);
});

test("BM25 ranking, formula, Top-K, stable zero ties and metadata", () => {
  const chunks = [chunk("a", "Python"), chunk("b", "RAG RAG"), chunk("c", "PageIndex")];
  const search = createBM25(chunks);
  const result = search("PAGEINDEX", 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c");
  assert.deepEqual(result[0].metadata, chunks[2].metadata);
  const expected = Math.log(1 + 2.5 / 1.5) * 2.2 / (1 + 1.2 * (0.25 + 0.75 / (4 / 3)));
  assert.ok(Math.abs(result[0].score - expected) < 1e-12);
  assert.ok(result.every(match => Number.isFinite(match.score) && match.score >= 0));
  assert.equal(search("rag", 1)[0].id, "b");
  assert.deepEqual(search("unknownword", 3).map(match => match.score), [0, 0, 0]);
  assert.deepEqual(search("", 3).map(match => match.id), ["a", "b", "c"]);
  assert.deepEqual(createBM25([])("rag"), []);
  assert.throws(() => search("rag", 0));
});

test("RRF uses 1-based ranks, merges IDs, rewards agreement and retains evidence", () => {
  const vector = [ranked("a"), ranked("b"), ranked("c")];
  const lexical = [ranked("b"), ranked("d"), ranked("a")];
  const result = reciprocalRankFusion([vector, lexical], 3);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(match => match.id)).size, 3);
  assert.equal(result[0].id, "b");
  assert.ok(Math.abs(result[0].score - (1 / 62 + 1 / 61)) < 1e-12);
  assert.deepEqual(result[0].metadata, vector[1].metadata);
  assert.equal(result[0].content, vector[1].content);
  assert.equal(vector[1].score, 0.8);
  assert.deepEqual(reciprocalRankFusion([]), []);
  assert.throws(() => reciprocalRankFusion([[ranked("a"), ranked("a")]]));
});

test("experimental Top-20 vector matches production Top-5; all strategies use same chunks", {skip: process.env.RUN_MODEL_TESTS !== "true"}, async () => {
  const index = await loadKnowledgeIndex();
  const production = await searchKnowledgeBase("PageIndex 长文档结构检索", 5, index);
  const candidates = await searchVector("PageIndex 长文档结构检索", 20, index);
  assert.equal(candidates.length, Math.min(20, index.chunks.length));
  assert.deepEqual(candidates.slice(0, 5), production);
  const bm25 = await searchBM25("PageIndex 长文档结构检索", 5, index);
  const hybrid = await searchHybrid("PageIndex 长文档结构检索", 5, index);
  const allowed = new Set(index.chunks.map(chunk => chunk.id));
  for (const matches of [bm25, hybrid]) {
    assert.equal(matches.length, 5);
    assert.equal(new Set(matches.map(match => match.id)).size, 5);
    assert.ok(matches.every(match => allowed.has(match.id) && Number.isFinite(match.score)));
  }
});
