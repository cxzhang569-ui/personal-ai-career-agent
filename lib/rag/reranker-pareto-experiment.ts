import { performance } from "node:perf_hooks";
import { searchVector } from "./vector-experiment";
import { rerank } from "./reranker";
import type { KnowledgeIndex, SearchResult } from "./types";
import type { RerankedResult } from "./reranker";

export const candidateSizes = [5, 10, 15, 20] as const;
export interface ParetoOptions { candidateTopN: number; finalTopK: number }

// Experiment only. The existing production and Top-20 experiment entry points are unchanged.
export function createRerankerExperiment(dependencies: {
  search: (query: string, n: number, index?: KnowledgeIndex) => Promise<SearchResult[]>;
  rerank: (query: string, candidates: SearchResult[], n: number) => Promise<RerankedResult[]>;
}) {
  return async (query: string, options: ParetoOptions, index?: KnowledgeIndex) => {
    if (options.finalTopK !== 5) throw new Error("Final Top-K must remain 5.");
    if (!candidateSizes.some(n => n === options.candidateTopN)) throw new Error("Candidate Top-N must be 5, 10, 15 or 20 (and at least Final Top-K).");
    const start = performance.now();
    const candidates = await dependencies.search(query, options.candidateTopN, index);
    const vectorEnd = performance.now();
    const ranked = await dependencies.rerank(query, candidates, options.candidateTopN);
    const end = performance.now();
    return { candidates, ranked, final: ranked.slice(0, 5), latency: {
      vectorMs: vectorEnd - start, rerankMs: end - vectorEnd, totalMs: end - start,
    } };
  };
}

export const runRerankerExperiment = createRerankerExperiment({ search: searchVector, rerank });
