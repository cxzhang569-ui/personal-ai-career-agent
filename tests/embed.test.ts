import test from "node:test";
import assert from "node:assert/strict";
import { embedText, embedTexts, embeddingDimensions } from "../lib/rag/embed";
import { cosineSimilarity } from "../lib/rag/similarity";

test("local BGE: normalized 512D vectors, consistent batching, cached inference without network", {skip: process.env.RUN_MODEL_TESTS !== "true"}, async () => {
  assert.deepEqual(await embedTexts([]), []);
  const texts = ["使用 Python 实现 RAG 检索。", "PageIndex 文档结构导航"];
  const [first, second] = await Promise.all([embedText(texts[0]), embedText(texts[1])]);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Cached inference must not access the network"); };
    const batch = await embedTexts(texts);
    for (const vector of [first, second, ...batch]) {
      assert.equal(vector.length, embeddingDimensions);
      assert.ok(vector.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.0001);
    }
    assert.ok(cosineSimilarity(first, batch[0]) > 0.99999);
    assert.ok(cosineSimilarity(second, batch[1]) > 0.99999);
    assert.ok(cosineSimilarity(first, second) < 0.99);
    const terms = await embedTexts(["Python", "python", "RAG", "PageIndex"]);
    assert.ok(cosineSimilarity(terms[0], terms[1]) > 0.99999);
    assert.ok(cosineSimilarity(terms[2], terms[3]) < 0.99);
    const long = await embedText("中文算法学习".repeat(200));
    assert.equal(long.length, embeddingDimensions);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
