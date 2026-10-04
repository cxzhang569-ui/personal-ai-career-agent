// First-round settings fixed before seeing reranking results. Experiment only.
export const rerankerExperiment = Object.freeze({
  model: "BAAI/bge-reranker-base",
  onnxModel: "Xenova/bge-reranker-base",
  revision: "280bcc27a84e0b898c251e06fddb25171bd9b101",
  device: "cpu" as const,
  dtype: "q8" as const,
  candidateTopN: 20,
  finalTopK: 5,
  batchSize: 4,
  maxLength: 512,
});
