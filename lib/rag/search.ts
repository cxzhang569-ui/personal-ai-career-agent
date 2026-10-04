import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AgentError } from "../ai/errors";
import { embedText, embeddingBaseURL, embeddingModel } from "./embed";
import { readKnowledge } from "./knowledge";
import { cosineSimilarity } from "./similarity";
import type { KnowledgeIndex, SearchResult } from "./types";

export async function loadKnowledgeIndex(): Promise<KnowledgeIndex> {
  let index: KnowledgeIndex;
  try { index = JSON.parse(await readFile(path.join(process.cwd(), "data/embeddings.json"), "utf8")) as KnowledgeIndex; }
  catch { throw new AgentError("知识库索引暂不可用，请站点维护者执行 ingestion。"); }
  if (index.version !== 1 || !Array.isArray(index.chunks) || index.chunks.some((chunk) => !chunk.id || !chunk.metadata || typeof chunk.content !== "string" || !Array.isArray(chunk.embedding) || !chunk.embedding.length || !chunk.embedding.every(Number.isFinite))) {
    throw new AgentError("知识库索引格式无效，请重新生成。");
  }
  const knowledge = await readKnowledge();
  if (knowledge.fingerprint !== index.fingerprint || index.model !== embeddingModel() || index.provider !== embeddingBaseURL()) throw new AgentError("个人资料或 Embedding 配置已更新，知识库需要重新生成索引后才能回答。");
  return index;
}

// The JSON storage implementation can be replaced by pgvector behind this function.
export async function searchKnowledgeBase(query: string, topK = 5, index?: KnowledgeIndex): Promise<SearchResult[]> {
  const store = index ?? await loadKnowledgeIndex();
  if (!store.chunks.length) return [];
  const embedding = await embedText(query);
  if (!embedding || store.chunks.some((chunk) => chunk.embedding.length !== embedding.length)) throw new AgentError("向量维度不匹配，请重新生成知识库索引。");
  return store.chunks.map(({ embedding: vector, ...chunk }) => ({ ...chunk, score: cosineSimilarity(embedding, vector) })).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(topK, 10)));
}
