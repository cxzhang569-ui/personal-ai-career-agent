import type { GradedQuestion } from "./graded-metrics";
import type { SearchResult } from "../lib/rag/types";

export const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function statistics(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { sampleCount: values.length, meanMs: mean(values),
    p50Ms: sorted[Math.ceil(sorted.length * .5) - 1] ?? null,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] ?? null };
}
export function evidenceRank(labels: GradedQuestion["primary_relevant"], results: SearchResult[]) {
  const keys = new Set(labels.map(l => JSON.stringify([l.source, l.section])));
  const position = results.findIndex(r => keys.has(JSON.stringify([r.metadata.source, r.metadata.section])));
  return position < 0 ? null : position + 1;
}
export interface ParetoPoint { name: string; primaryHit1: number; primaryMRR: number; rerankMeanMs: number }
export function paretoFrontier(points: ParetoPoint[]) {
  const dominated = points.map(point => ({ name: point.name, dominatedBy: points.filter(other =>
    other.name !== point.name && other.primaryHit1 >= point.primaryHit1 && other.primaryMRR >= point.primaryMRR && other.rerankMeanMs <= point.rerankMeanMs &&
    (other.primaryHit1 > point.primaryHit1 || other.primaryMRR > point.primaryMRR || other.rerankMeanMs < point.rerankMeanMs)
  ).map(p => p.name) }));
  return { objectives: "maximize Primary Hit@1 and Primary MRR@5; minimize mean reranker latency", frontier: dominated.filter(p => !p.dominatedBy.length).map(p => p.name), dominated: dominated.filter(p => p.dominatedBy.length) };
}
