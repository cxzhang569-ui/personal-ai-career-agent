import { searchBM25 } from "./bm25";
import { searchVector } from "./vector-experiment";
import { loadKnowledgeIndex } from "./search";
import { resultLimit, retrievalExperiment } from "./experiment-config";
import type { KnowledgeIndex, SearchResult } from "./types";

export function reciprocalRankFusion(lists: SearchResult[][], topK: number = retrievalExperiment.finalTopK, k: number = retrievalExperiment.rrfK): SearchResult[] {
  if (!Number.isFinite(k) || k < 0) throw new Error("RRF k must be finite and non-negative.");
  const fused = new Map<string, SearchResult>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((match, i) => {
      if (seen.has(match.id)) throw new Error("Duplicate ID within a ranked list.");
      seen.add(match.id);
      const score = 1 / (k + i + 1);
      const existing = fused.get(match.id);
      if (existing) existing.score += score;
      else fused.set(match.id, { ...match, score });
    });
  }
  // Stable ties use first appearance: vector list precedes BM25 list.
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, resultLimit(topK, fused.size));
}

export async function searchHybrid(query: string, topK: number = retrievalExperiment.finalTopK, index?: KnowledgeIndex): Promise<SearchResult[]> {
  const store = index ?? await loadKnowledgeIndex();
  const vector = await searchVector(query, retrievalExperiment.candidateTopN, store);
  const bm25 = await searchBM25(query, retrievalExperiment.candidateTopN, store);
  return reciprocalRankFusion([vector, bm25], topK);
}
