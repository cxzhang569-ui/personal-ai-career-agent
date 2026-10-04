import test from "node:test";
import assert from "node:assert/strict";
import { createProductionRetrieval } from "../lib/rag/retrieval";
import { getRetrievalConfig, retrievalDefaults } from "../lib/rag/retrieval-config";
import type { SearchResult } from "../lib/rag/types";
import { observeTimings, RequestTiming } from "../lib/request-timing";

const rows: SearchResult[] = Array.from({length: 15}, (_, i) => ({id: String(i), content: "evidence", score: 1 / (i + 1), metadata: {source: "projects.md", section: String(i), type: "project"}}));
const config = (on: boolean, timeout = 1000) => ({...retrievalDefaults, rerankerEnabled: on, debug: false, rerankerTimeoutMs: timeout});

test("production flag off/on: fixed 5/15/5, no extra search, original metadata retained", async () => {
  let on = false, vectorCalls = 0, candidateCalls = 0, rerankCalls = 0;
  const pipeline = createProductionRetrieval({config: () => config(on),
    vector: async (_, n) => {vectorCalls++; assert.equal(n, 5); return rows.slice(0, 5);},
    candidates: async (_, n) => {candidateCalls++; assert.equal(n, 15); return rows;},
    rerank: async (_, candidates, k) => {rerankCalls++; assert.equal(k, 5); return [...candidates].reverse().slice(0, k).map(r => ({...r, rerankScore: 1, originalRank: Number(r.id) + 1}));},
  });
  assert.deepEqual(await pipeline.search("q"), rows.slice(0, 5)); assert.equal(rerankCalls, 0);
  on = true;
  const result = await pipeline.search("q"); assert.equal(result[0].id, "14"); assert.deepEqual(result[0].metadata, rows[14].metadata);
  assert.deepEqual([vectorCalls, candidateCalls, rerankCalls], [1, 1, 1]);
});

test("reranker exceptions and malformed output reuse Vector Top-5; logs redact error contents", async () => {
  for (const failure of [true, false]) {
    const logs: Record<string, unknown>[] = []; let searches = 0;
    const pipeline = createProductionRetrieval({config: () => config(true), vector: async () => {throw new Error("must not re-search");}, candidates: async () => {searches++; return rows;},
      rerank: async () => {if (failure) throw new Error("private key / tokenizer details"); return [];}, log: r => logs.push(r)});
    assert.deepEqual(await pipeline.search("private query"), rows.slice(0, 5)); assert.equal(searches, 1);
    assert.equal(logs[0].reason, "reranker_error"); assert.ok(!JSON.stringify(logs).includes("private"));
  }
});

test("timeout falls back, expired native work blocks new inference until settling, then recovers", async () => {
  let calls = 0;
  let resolve!: (value: Awaited<ReturnType<Parameters<typeof createProductionRetrieval>[0]["rerank"]>>) => void;
  const pending = new Promise<Awaited<ReturnType<Parameters<typeof createProductionRetrieval>[0]["rerank"]>>>(r => {resolve = r;});
  const logs: Record<string, unknown>[] = [];
  const pipeline = createProductionRetrieval({config: () => config(true, 5), vector: async () => rows.slice(0, 5), candidates: async () => rows,
    rerank: async () => {calls++; return pending;}, log: r => logs.push(r)});
  assert.deepEqual(await pipeline.search("q"), rows.slice(0, 5));
  assert.deepEqual(await pipeline.search("q"), rows.slice(0, 5)); assert.equal(calls, 1);
  assert.deepEqual(logs.map(r => r.reason), ["timeout", "previous_timeout_still_running"]);
  resolve(rows.slice(0, 5).map((r, i) => ({...r, rerankScore: 1, originalRank: i + 1})));
  await pipeline.drain(); await pipeline.search("q"); assert.equal(calls, 2);
});

test("feature configuration defaults off and bounds malformed timeouts", () => {
  const names = ["RERANKER_ENABLED", "RERANKER_TIMEOUT_MS", "RAG_DEBUG"];
  const before = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    assert.equal(getRetrievalConfig().rerankerEnabled, false); assert.equal(getRetrievalConfig().rerankerTimeoutMs, 2500);
    for (const value of ["", "-1", "bad", "100000"]) {process.env.RERANKER_TIMEOUT_MS = value; assert.equal(getRetrievalConfig().rerankerTimeoutMs, 2500);}
  } finally {names.forEach((name, i) => {if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i];});}
});

test("timing marks failed LLM phases, does not invent TTFT, and isolates observers", () => {
  const stop = observeTimings(() => {throw new Error("diagnostic failure");});
  try {
    const timing = new RequestTiming(12);
    timing.mark("llm_start");
    const record = timing.finish();
    assert.equal(record.queryLength, 12);
    assert.equal(record.timeToFirstTokenMs, null);
    assert.ok(record.llmMs >= 0);
    assert.ok(record.events.llm_end! >= record.events.llm_start!);
    assert.ok(record.requestTotalMs >= record.llmMs);
    assert.equal("query" in record, false);
    assert.equal("prompt" in record, false);
  } finally {stop();}
});
