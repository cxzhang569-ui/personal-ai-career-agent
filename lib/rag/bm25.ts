import type { KnowledgeChunk, KnowledgeIndex, SearchResult } from "./types";
import { resultLimit, retrievalExperiment } from "./experiment-config";

const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

export function tokenizeBM25(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  return [...segmenter.segment(normalized)].filter(part => part.isWordLike)
    .flatMap(part => part.segment.match(/[\p{L}\p{N}]+/gu) ?? []);
}

export function createBM25(chunks: KnowledgeChunk[], k1: number = retrievalExperiment.bm25K1, b: number = retrievalExperiment.bm25B) {
  if (!Number.isFinite(k1) || k1 <= 0 || !Number.isFinite(b) || b < 0 || b > 1) throw new Error("Invalid BM25 parameters.");
  if (new Set(chunks.map(chunk => chunk.id)).size !== chunks.length) throw new Error("Duplicate chunk ID.");
  const documentFrequency = new Map<string, number>();
  const documents = chunks.map(chunk => {
    // Existing content already includes the full section heading. No field boosting.
    const tokens = tokenizeBM25(chunk.content);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    for (const token of frequencies.keys()) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    return { chunk, length: tokens.length, frequencies };
  });
  const averageLength = documents.length ? documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length : 0;
  return (query: string, topK: number = retrievalExperiment.finalTopK): SearchResult[] => {
    const limit = resultLimit(topK, documents.length);
    const queryTerms = [...new Set(tokenizeBM25(query))];
    return documents.map(({ chunk, length, frequencies }) => {
      let score = 0;
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (!frequency) continue;
        const df = documentFrequency.get(term)!;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const lengthFactor = 1 - b + b * length / (averageLength || 1);
        score += idf * frequency * (k1 + 1) / (frequency + k1 * lengthFactor);
      }
      return { id: chunk.id, content: chunk.content, metadata: chunk.metadata, score };
    }).sort((left, right) => right.score - left.score).slice(0, limit);
  };
}

const cachedIndexes = new WeakMap<KnowledgeIndex, ReturnType<typeof createBM25>>();
export async function searchBM25(query: string, topK: number = retrievalExperiment.finalTopK, index?: KnowledgeIndex): Promise<SearchResult[]> {
  const store = index ?? await (await import("./search")).loadKnowledgeIndex();
  let search = cachedIndexes.get(store);
  if (!search) { search = createBM25(store.chunks); cachedIndexes.set(store, search); }
  return search(query, topK);
}
