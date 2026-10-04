import { loadKnowledgeIndex, searchKnowledgeBase } from "./search";
import { resultLimit, retrievalExperiment } from "./experiment-config";
import type { KnowledgeIndex, SearchResult } from "./types";

export async function searchVector(query: string, topK: number = retrievalExperiment.finalTopK, index?: KnowledgeIndex): Promise<SearchResult[]> {
  const store = index ?? await loadKnowledgeIndex();
  const limit = resultLimit(topK, store.chunks.length);
  if (topK <= 10) return searchKnowledgeBase(query, topK, store);
  // Production caps Top-K at 10. Score disjoint groups of <=10 through that same
  // function, then merge all scores. No second embedding or cosine implementation.
  // Stable ties retain the original chunk order, exactly as production does.
  const scores = new Map<string, SearchResult>();
  for (let start = 0; start < store.chunks.length; start += 10) {
    const group = { ...store, chunks: store.chunks.slice(start, start + 10) };
    for (const match of await searchKnowledgeBase(query, 10, group)) scores.set(match.id, match);
  }
  return store.chunks.map(chunk => scores.get(chunk.id)!).sort((a, b) => b.score - a.score).slice(0, limit);
}
