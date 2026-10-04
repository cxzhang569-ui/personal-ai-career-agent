import type { SearchResult } from "../lib/rag/types";
import type { ExpectedEvidence } from "./metrics";

export interface GradedQuestion {
  id: string;
  question: string;
  category: string;
  evaluation_type: "retrieval" | "unknown";
  primary_relevant: ExpectedEvidence[];
  supporting_relevant: ExpectedEvidence[];
  should_have_answer: boolean;
}

const key = (label: ExpectedEvidence) => JSON.stringify([label.source, label.section]);
const sources = (labels: ExpectedEvidence[]) => [...new Set(labels.map(label => label.source))];

export function validateGradedDataset(value: unknown, available: ExpectedEvidence[]): asserts value is GradedQuestion[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Graded dataset must be a non-empty array.");
  const ids = new Set<string>();
  const known = new Set(available.map(key));
  for (const item of value) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || typeof item.question !== "string" || !item.question.trim() || typeof item.category !== "string" || !item.category.trim() || typeof item.should_have_answer !== "boolean") throw new Error("Invalid or duplicate graded question.");
    ids.add(item.id);
    const positive = item.should_have_answer;
    if (item.evaluation_type !== (positive ? "retrieval" : "unknown")) throw new Error(`Inconsistent evaluation type: ${item.id}.`);
    const seen = new Set<string>();
    for (const field of ["primary_relevant", "supporting_relevant"] as const) {
      if (!Array.isArray(item[field])) throw new Error(`Missing relevance levels: ${item.id}.`);
      for (const label of item[field]) {
        if (!label || typeof label.source !== "string" || typeof label.section !== "string" || !known.has(key(label))) throw new Error(`Unknown graded evidence: ${item.id}.`);
        if (seen.has(key(label))) throw new Error(`Duplicate / overlapping relevance: ${item.id}.`);
        seen.add(key(label));
      }
    }
    if (positive ? !seen.size : seen.size > 0) throw new Error(`Invalid retrieval / unknown labels: ${item.id}.`);
  }
}

function grade(labels: ExpectedEvidence[], matches: SearchResult[]) {
  const expected = new Set(labels.map(key));
  const relevant = matches.map(match => expected.has(key(match.metadata)));
  const index = relevant.findIndex(Boolean);
  const rank = index < 0 ? null : index + 1;
  const expectedSources = sources(labels);
  // A matching section is required: any unrelated section from that file cannot earn recall.
  const matchedSources = new Set(matches.filter((_, i) => relevant[i]).map(match => match.metadata.source));
  return {
    firstRelevantRank: rank,
    hitAt1: Number(rank !== null && rank <= 1),
    hitAt3: Number(rank !== null && rank <= 3),
    hitAt5: Number(rank !== null && rank <= 5),
    reciprocalRank: rank === null ? 0 : 1 / rank,
    sourceRecallAt5: expectedSources.length ? matchedSources.size / expectedSources.length : null,
    expectedSources, missingSources: expectedSources.filter(source => !matchedSources.has(source)),
  };
}

export function evaluateGradedQuestion(question: GradedQuestion, matches: SearchResult[]) {
  const top = matches.slice(0, 5);
  if (top.some(match => !Number.isFinite(match.score))) throw new Error("Retrieval score must be finite.");
  const primary = new Set(question.primary_relevant.map(key));
  const supporting = new Set(question.supporting_relevant.map(key));
  return {
    ...question,
    primary_sources: sources(question.primary_relevant),
    supporting_sources: sources(question.supporting_relevant),
    retrieved: top.map(match => ({
      id: match.id, source: match.metadata.source, section: match.metadata.section, score: match.score,
      relevance: primary.has(key(match.metadata)) ? "primary" : supporting.has(key(match.metadata)) ? "supporting" : "unlabeled",
    })),
    primary: question.evaluation_type === "retrieval" ? grade(question.primary_relevant, top) : null,
    relevant: question.evaluation_type === "retrieval" ? grade([...question.primary_relevant, ...question.supporting_relevant], top) : null,
    unknown: question.evaluation_type === "unknown" ? {
      status: "not-evaluated" as const, returnedCount: top.length, emptyRetrieval: top.length === 0,
      reason: "Unknown detection and answer abstention are not evaluated by relevance ranking.",
    } : null,
  };
}

export type GradedEvaluation = ReturnType<typeof evaluateGradedQuestion>;

export function summarizeGraded(results: GradedEvaluation[]) {
  const positive = results.filter(result => result.evaluation_type === "retrieval");
  const unknown = results.filter(result => result.evaluation_type === "unknown");
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const level = (name: "primary" | "relevant") => {
    const rows = positive.map(result => result[name]!);
    const sourceRows = rows.filter(row => row.sourceRecallAt5 !== null);
    return {
      hitAt1: average(rows.map(row => row.hitAt1)), hitAt3: average(rows.map(row => row.hitAt3)),
      hitAt5: average(rows.map(row => row.hitAt5)), mrr: average(rows.map(row => row.reciprocalRank)),
      sourceRecallAt5: average(sourceRows.map(row => row.sourceRecallAt5!)), sourceRecallSampleCount: sourceRows.length,
      noSinglePrimaryCount: name === "primary" ? rows.filter(row => !row.expectedSources.length).length : 0,
    };
  };
  return {
    total: results.length, positive: positive.length, unknown: unknown.length,
    primary: level("primary"), relevant: level("relevant"),
    unknownEvaluation: { status: "not-evaluated", sampleCount: unknown.length, emptyRetrievalCount: unknown.filter(result => result.unknown!.emptyRetrieval).length, abstentionRate: null },
  };
}
