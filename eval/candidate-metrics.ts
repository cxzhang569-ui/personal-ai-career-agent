import type { GradedQuestion } from "./graded-metrics";
import type { ExpectedEvidence } from "./metrics";
import type { SearchResult } from "../lib/rag/types";

export const candidateKs = [5, 10, 20, 30] as const;
export const rankBands = ["1", "2-3", "4-5", "6-10", "11-20", "21-30", ">30"] as const;
export type CandidateMetric = `${"primaryRecall" | "relevantRecall" | "primarySectionRecall" | "relevantSectionRecall"}At${typeof candidateKs[number]}`;
const key = (e: ExpectedEvidence) => JSON.stringify([e.source, e.section]);
export const recallAt = (rank: number | null, k: number) => Number(rank !== null && rank <= k);

export function evaluateCandidate(question: GradedQuestion, matches: SearchResult[]) {
  if (question.evaluation_type !== "retrieval") return null;
  const top = matches.slice(0, 30);
  if (top.some(m => !Number.isFinite(m.score))) throw new Error("Non-finite score.");
  const primary = new Set(question.primary_relevant.map(key));
  const relevant = new Set([...question.primary_relevant, ...question.supporting_relevant].map(key));
  const first = (labels: Set<string>) => {
    const i = top.findIndex(m => labels.has(key(m.metadata)));
    return i < 0 ? null : i + 1;
  };
  const sectionRecall = (labels: Set<string>) => Object.fromEntries(candidateKs.map(k => [k,
    labels.size ? new Set(top.slice(0, k).map(m => key(m.metadata)).filter(s => labels.has(s))).size / labels.size : null,
  ]));
  const firstPrimary = first(primary);
  return {
    ...question, primary_eligible: primary.size > 0,
    first_primary_rank: firstPrimary, first_relevant_rank: first(relevant),
    failure_class: !primary.size || recallAt(firstPrimary, 5) ? null : firstPrimary === null ? "D" : firstPrimary <= 10 ? "A" : firstPrimary <= 20 ? "B" : "C",
    primary_section_recall: sectionRecall(primary), relevant_section_recall: sectionRecall(relevant),
    top30: top.map((m, i) => ({ rank: i + 1, id: m.id, score: m.score, source: m.metadata.source, section: m.metadata.section,
      relevance: primary.has(key(m.metadata)) ? "primary" : relevant.has(key(m.metadata)) ? "supporting" : "unlabeled" })),
  };
}
export type CandidateResult = NonNullable<ReturnType<typeof evaluateCandidate>>;

export function summarizeCandidates(results: CandidateResult[]) {
  const primary = results.filter(r => r.primary_eligible);
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const distribution = (rows: CandidateResult[], field: "first_primary_rank" | "first_relevant_rank") => Object.fromEntries(rankBands.map((band, i) => [band, rows.filter(r => {
    const rank = r[field];
    if (rank === null) return band === ">30";
    return rank <= [1, 3, 5, 10, 20, 30, Infinity][i] && rank > [0, 1, 3, 5, 10, 20, 30][i];
  }).length]));
  return {
    primarySampleCount: primary.length, relevantSampleCount: results.length, noPrimaryCount: results.length - primary.length,
    ...(Object.fromEntries(candidateKs.flatMap(k => [
      [`primaryRecallAt${k}`, avg(primary.map(r => recallAt(r.first_primary_rank, k)))],
      [`relevantRecallAt${k}`, avg(results.map(r => recallAt(r.first_relevant_rank, k)))],
      [`primarySectionRecallAt${k}`, avg(primary.map(r => r.primary_section_recall[k]!))],
      [`relevantSectionRecallAt${k}`, avg(results.map(r => r.relevant_section_recall[k]!))],
    ])) as Record<CandidateMetric, number | null>),
    primaryRankDistribution: distribution(primary, "first_primary_rank"), relevantRankDistribution: distribution(results, "first_relevant_rank"),
  };
}
