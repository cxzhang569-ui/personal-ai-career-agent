import { searchVector } from "./vector-experiment";
import { rerank } from "./reranker";
import { rerankerExperiment } from "./reranker-experiment-config";
import type { KnowledgeIndex } from "./types";

// Experiment only. Production search / agent do not import this module.
export async function searchVectorWithReranker(query: string, index?: KnowledgeIndex) {
  const candidates = await searchVector(query, rerankerExperiment.candidateTopN, index);
  return rerank(query, candidates, rerankerExperiment.finalTopK);
}
