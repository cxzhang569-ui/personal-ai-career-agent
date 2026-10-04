import "server-only";

export const retrievalDefaults = Object.freeze({vectorTopK: 5, rerankerCandidateTopN: 15, rerankerFinalTopK: 5, rerankerTimeoutMs: 2500});
export function getRetrievalConfig() {
  const configured = Number(process.env.RERANKER_TIMEOUT_MS);
  return {...retrievalDefaults, rerankerEnabled: process.env.RERANKER_ENABLED === "true", debug: process.env.RAG_DEBUG === "true",
    rerankerTimeoutMs: Number.isInteger(configured) && configured >= 1 && configured <= 10000 ? configured : retrievalDefaults.rerankerTimeoutMs};
}
