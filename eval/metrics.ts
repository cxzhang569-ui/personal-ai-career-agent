import type { SearchResult } from "../lib/rag/types";

export interface ExpectedEvidence { source: string; section: string }
export interface EvalQuestion {
  id: string;
  question: string;
  category: string;
  expected_sources: string[];
  expected_sections: string[];
  expected_evidence: ExpectedEvidence[];
  should_have_answer: boolean;
}
export interface QueryEvaluation extends EvalQuestion {
  retrieved: { id: string; source: string; section: string; score: number; relevant: boolean; accepted: boolean }[];
  firstRelevantRank: number | null;
  hitAt1: number | null;
  hitAt3: number | null;
  hitAt5: number | null;
  reciprocalRank: number | null;
  sourceRecallAt5: number | null;
  missingSources: string[];
  rejected: boolean;
  pass: boolean;
}

export function evaluateQuestion(question: EvalQuestion, matches: SearchResult[], minScore: number | null = null): QueryEvaluation {
  if (minScore !== null && (!Number.isFinite(minScore) || minScore < -1 || minScore > 1)) throw new Error("minScore must be within [-1, 1].");
  const retrieved = matches.slice(0, 5).map(match => {
    if (!Number.isFinite(match.score)) throw new Error("Retrieval score must be finite.");
    return {
      id: match.id, source: match.metadata.source, section: match.metadata.section, score: match.score,
      relevant: question.expected_evidence.some(label => label.source === match.metadata.source && label.section === match.metadata.section),
      accepted: minScore === null || match.score >= minScore,
    };
  });
  const rankIndex = retrieved.findIndex(match => match.relevant && match.accepted);
  const firstRelevantRank = rankIndex < 0 ? null : rankIndex + 1;
  const hit = (k: number) => Number(firstRelevantRank !== null && firstRelevantRank <= k);
  const acceptedSources = new Set(retrieved.filter(match => match.accepted).map(match => match.source));
  const expectedSources = [...new Set(question.expected_sources)];
  const missingSources = expectedSources.filter(source => !acceptedSources.has(source));
  const rejected = !retrieved.some(match => match.accepted);
  const positive = question.should_have_answer;
  return {
    ...question, retrieved, firstRelevantRank,
    hitAt1: positive ? hit(1) : null, hitAt3: positive ? hit(3) : null, hitAt5: positive ? hit(5) : null,
    reciprocalRank: positive ? (firstRelevantRank === null ? 0 : 1 / firstRelevantRank) : null,
    sourceRecallAt5: positive ? (expectedSources.length ? (expectedSources.length - missingSources.length) / expectedSources.length : 0) : null,
    missingSources, rejected, pass: positive ? hit(5) === 1 : rejected,
  };
}

export function summarize(results: QueryEvaluation[]) {
  const positive = results.filter(result => result.should_have_answer);
  const negative = results.filter(result => !result.should_have_answer);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const categoryCounts: Record<string, number> = {};
  for (const result of results) categoryCounts[result.category] = (categoryCounts[result.category] ?? 0) + 1;
  return {
    total: results.length, positive: positive.length, negative: negative.length, categoryCounts,
    hitAt1: average(positive.map(result => result.hitAt1!)),
    hitAt3: average(positive.map(result => result.hitAt3!)),
    hitAt5: average(positive.map(result => result.hitAt5!)),
    mrr: average(positive.map(result => result.reciprocalRank!)),
    sourceRecallAt5: average(positive.map(result => result.sourceRecallAt5!)),
    negativeRejectionRate: average(negative.map(result => Number(result.rejected))),
  };
}

export function validateDataset(value: unknown, available: ExpectedEvidence[]): asserts value is EvalQuestion[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Evaluation dataset must be a non-empty array.");
  const ids = new Set<string>();
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.every(item => typeof item === "string" && item.trim().length > 0) && new Set(items).size === items.length;
  for (const item of value) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || typeof item.question !== "string" || !item.question.trim() || typeof item.category !== "string" || !item.category.trim() || typeof item.should_have_answer !== "boolean" || !strings(item.expected_sources) || !strings(item.expected_sections) || !Array.isArray(item.expected_evidence)) throw new Error("Invalid or duplicate evaluation question.");
    ids.add(item.id);
    const evidence = item.expected_evidence as ExpectedEvidence[];
    if (evidence.some(label => !label || typeof label.source !== "string" || typeof label.section !== "string" || !available.some(chunk => chunk.source === label.source && chunk.section === label.section))) throw new Error(`Unknown source / section in ${item.id}.`);
    if (new Set(evidence.map(label => JSON.stringify(label))).size !== evidence.length) throw new Error(`Duplicate evidence in ${item.id}.`);
    const sources = [...new Set(evidence.map(label => label.source))];
    const sections = [...new Set(evidence.map(label => label.section))];
    if (sources.length !== item.expected_sources.length || sources.some(source => !item.expected_sources.includes(source)) || sections.length !== item.expected_sections.length || sections.some(section => !item.expected_sections.includes(section))) throw new Error(`Inconsistent labels in ${item.id}.`);
    if (item.should_have_answer ? !evidence.length : evidence.length > 0) throw new Error(`Invalid positive / negative labels in ${item.id}.`);
  }
}
