import type { GradedQuestion } from "./graded-metrics";
import type { SearchResult } from "../lib/rag/types";
import type { RerankedResult } from "../lib/rag/reranker";
import type { Source } from "../lib/shared";
import { statistics } from "./reranker-pareto-metrics";

export function safeRanking(rows: SearchResult[]) {
  return rows.map((row, i) => ({rank: i + 1, id: row.id, source: row.metadata.source, section: row.metadata.section,
    vectorScore: row.score, originalVectorRank: (row as Partial<RerankedResult>).originalRank ?? i + 1,
    rerankScore: (row as Partial<RerankedResult>).rerankScore ?? null}));
}
export function sourceDiagnostics(rows: Pick<Source, "id" | "source" | "section">[], label: GradedQuestion) {
  const matches = (labels: GradedQuestion["primary_relevant"]) => rows.filter(row => labels.some(l => l.source === row.source && l.section === row.section)).map(row => row.id);
  const primary = matches(label.primary_relevant);
  const relevant = matches([...label.primary_relevant, ...label.supporting_relevant]);
  return {sourceCount: rows.length, duplicateSources: rows.length !== new Set(rows.map(row => row.id)).size,
    primarySectionPresent: primary.length > 0, relevantSectionPresent: relevant.length > 0,
    primaryIds: primary, relevantIds: relevant};
}
export function compareSources(a: ReturnType<typeof sourceDiagnostics>, b: ReturnType<typeof sourceDiagnostics>, aIds: string[], bIds: string[]) {
  if ([...aIds].sort().join("\n") === [...bIds].sort().join("\n")) return "Same";
  if (b.primaryIds.length < a.primaryIds.length || b.relevantIds.length < a.relevantIds.length) return "Potential Regression";
  if (b.primaryIds.length > a.primaryIds.length || b.relevantIds.length > a.relevantIds.length) return "Improved";
  return "Changed";
}
export function summarizeE2E(rows: {timing: {requestTotalMs: number; deepSeekMs: number; retrievalTotalMs: number; rerankMs: number; vectorSearchMs: number}; answerChars: number; fallback: boolean}[]) {
  const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
  return {sampleCount: rows.length, request: statistics(rows.map(r => r.timing.requestTotalMs)),
    meanDeepSeekMs: mean(rows.map(r => r.timing.deepSeekMs)), meanRetrievalTotalMs: mean(rows.map(r => r.timing.retrievalTotalMs)),
    meanVectorSearchMs: mean(rows.map(r => r.timing.vectorSearchMs)), meanRerankMs: mean(rows.map(r => r.timing.rerankMs)),
    retrievalShareOfTotal: rows.reduce((sum, r) => sum + r.timing.retrievalTotalMs, 0) / rows.reduce((sum, r) => sum + r.timing.requestTotalMs, 0),
    rerankerShareOfTotal: rows.reduce((sum, r) => sum + r.timing.rerankMs, 0) / rows.reduce((sum, r) => sum + r.timing.requestTotalMs, 0),
    meanAnswerChars: mean(rows.map(r => r.answerChars)), fallbackCount: rows.filter(r => r.fallback).length};
}
