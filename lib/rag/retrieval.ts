import "server-only";
import { performance } from "node:perf_hooks";
import { searchVector } from "./vector-experiment";
import { searchKnowledgeBase as searchVectorOnly } from "./search";
import { rerank, type RerankedResult } from "./reranker";
import { getRetrievalConfig, retrievalDefaults } from "./retrieval-config";
import type { KnowledgeIndex, SearchResult } from "./types";
import type { RequestTiming } from "../request-timing";

export function createProductionRetrieval(dependencies: {
  vector: typeof searchVectorOnly; candidates: typeof searchVector; rerank: typeof rerank;
  config: typeof getRetrievalConfig;
  log?: (record: Record<string, unknown>) => void;
}) {
  // A timeout cannot cancel native ONNX work. While expired work is settling,
  // subsequent requests fall back rather than creating more abandoned inference.
  const pending = new Set<Promise<unknown>>();
  let expiredWork = 0;
  const search = async (query: string, topK = retrievalDefaults.vectorTopK, index?: KnowledgeIndex, timing?: RequestTiming): Promise<SearchResult[]> => {
    const config = dependencies.config();
    timing?.mark("vector_search_start");
    const candidates = config.rerankerEnabled ? await dependencies.candidates(query, config.rerankerCandidateTopN, index) : await dependencies.vector(query, topK, index);
    timing?.mark("vector_search_end");
    if (!config.rerankerEnabled || !candidates.length) return candidates;
    const fallback = (reason: string) => {
      if (timing) { timing.rerankerFallback = true; timing.reason = reason; }
      dependencies.log?.({reranker_fallback: true, reason, candidateCount: candidates.length});
      return candidates.slice(0, config.vectorTopK);
    };
    if (expiredWork) return fallback("previous_timeout_still_running");
    timing?.mark("rerank_start");
    const start = performance.now();
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = Promise.resolve().then(() => dependencies.rerank(query, candidates, config.rerankerFinalTopK));
    const settled = work.then(() => undefined, () => undefined).finally(() => { pending.delete(settled); if (expired) expiredWork--; });
    pending.add(settled);
    try {
      const output = await Promise.race([work, new Promise<RerankedResult[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error("reranker_timeout")), config.rerankerTimeoutMs);
      })]);
      if (performance.now() - start >= config.rerankerTimeoutMs) throw new Error("reranker_timeout");
      if (output.length !== Math.min(config.rerankerFinalTopK, candidates.length) || new Set(output.map(r => r.id)).size !== output.length || output.some(r => !Number.isFinite(r.rerankScore) || !candidates.some(c => c.id === r.id))) throw new Error("invalid_reranker_output");
      if (timing) timing.usedReranker = true;
      if (config.debug) dependencies.log?.({reranker_fallback: false, candidateCount: candidates.length, sections: output.map(r => r.metadata.section), scoreMin: Math.min(...output.map(r => r.rerankScore)), scoreMax: Math.max(...output.map(r => r.rerankScore))});
      return output;
    } catch (error) {
      const timeout = (error as Error)?.message === "reranker_timeout";
      if (timeout && pending.has(settled)) { expired = true; expiredWork++; }
      return fallback(timeout ? "timeout" : "reranker_error");
    } finally { if (timer) clearTimeout(timer); timing?.mark("rerank_end"); }
  };
  return {search, drain: async () => {await Promise.all([...pending]);}};
}

const production = createProductionRetrieval({vector: searchVectorOnly, candidates: searchVector, rerank, config: getRetrievalConfig,
  log: record => console.info("rag_retrieval", JSON.stringify(record))});
export const searchKnowledgeBase = production.search;
export const drainReranker = production.drain;
