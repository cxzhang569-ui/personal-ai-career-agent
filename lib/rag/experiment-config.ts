// Fixed before the first comparison run; not tuned on evaluation questions.
export const retrievalExperiment = Object.freeze({
  finalTopK: 5,
  candidateTopN: 20,
  rrfK: 60,
  bm25K1: 1.2,
  bm25B: 0.75,
});

export function resultLimit(topK: number, count: number): number {
  if (!Number.isInteger(topK) || topK < 1) throw new Error("topK must be a positive integer.");
  return Math.min(topK, count);
}
