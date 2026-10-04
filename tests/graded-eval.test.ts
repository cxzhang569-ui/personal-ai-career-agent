import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGradedQuestion, summarizeGraded, validateGradedDataset, type GradedQuestion } from "../eval/graded-metrics";
import type { SearchResult } from "../lib/rag/types";

const primary = { source: "projects.md", section: "Architecture" };
const supporting = { source: "skills.md", section: "Evidence" };
const q: GradedQuestion = { id: "q", question: "How?", category: "rag", evaluation_type: "retrieval", should_have_answer: true, primary_relevant: [primary], supporting_relevant: [supporting] };
const match = (label: typeof primary): SearchResult => ({ id: JSON.stringify(label), metadata: { ...label, type: "test" }, content: "test", score: .8 });

test("graded: supporting cannot earn primary hit; exact pairs and Top-5 cutoff", () => {
  const result = evaluateGradedQuestion(q, [match(supporting), match({ source: "skills.md", section: "Architecture" }), match(primary)]);
  assert.equal(result.primary!.firstRelevantRank, 3);
  assert.equal(result.primary!.hitAt1, 0);
  assert.equal(result.relevant!.hitAt1, 1);
  assert.equal(result.primary!.reciprocalRank, 1 / 3);
  assert.equal(result.retrieved[1].relevance, "unlabeled");
  const sixth = evaluateGradedQuestion(q, Array.from({ length: 5 }, () => match(supporting)).concat(match(primary)));
  assert.equal(sixth.primary!.hitAt5, 0);
  assert.equal(sixth.relevant!.hitAt5, 1);
});

test("graded: source recall requires matching sections and deduplicates sources", () => {
  const result = evaluateGradedQuestion(q, [match({ source: "projects.md", section: "Unrelated" }), match(supporting), match(supporting)]);
  assert.equal(result.primary!.sourceRecallAt5, 0);
  assert.equal(result.relevant!.sourceRecallAt5, .5);
  const empty = evaluateGradedQuestion(q, []);
  assert.equal(empty.relevant!.reciprocalRank, 0);
});

test("graded: combined-evidence questions retain zero primary hits, undefined source denominator", () => {
  const combined = evaluateGradedQuestion({ ...q, primary_relevant: [] }, [match(supporting)]);
  assert.equal(combined.primary!.sourceRecallAt5, null);
  const summary = summarizeGraded([combined, evaluateGradedQuestion(q, [match(primary)])]);
  assert.equal(summary.primary.hitAt1, .5);
  assert.equal(summary.primary.sourceRecallAt5, 1);
  assert.equal(summary.primary.sourceRecallSampleCount, 1);
  assert.equal(summary.primary.noSinglePrimaryCount, 1);
});

test("graded: unknown never participates in retrieval or abstention accuracy", () => {
  const unknown: GradedQuestion = { ...q, id: "unknown", evaluation_type: "unknown", should_have_answer: false, primary_relevant: [], supporting_relevant: [] };
  const result = evaluateGradedQuestion(unknown, [match(primary)]);
  assert.equal(result.primary, null);
  assert.equal(result.relevant, null);
  assert.equal(result.unknown!.status, "not-evaluated");
  const summary = summarizeGraded([result, evaluateGradedQuestion(q, [match(primary)])]);
  assert.equal(summary.primary.hitAt1, 1);
  assert.equal(summary.unknownEvaluation.abstentionRate, null);
  assert.equal(summarizeGraded([result]).relevant.mrr, null);
});

test("graded: validation rejects overlapping, missing, inconsistent and unknown labels", () => {
  validateGradedDataset([q], [primary, supporting]);
  validateGradedDataset([{ ...q, primary_relevant: [] }], [supporting]);
  assert.throws(() => validateGradedDataset([q, q], [primary, supporting]));
  assert.throws(() => validateGradedDataset([{ ...q, supporting_relevant: [primary] }], [primary]));
  assert.throws(() => validateGradedDataset([q], []));
  assert.throws(() => validateGradedDataset([{ ...q, evaluation_type: "unknown" }], [primary, supporting]));
  assert.throws(() => validateGradedDataset([{ ...q, primary_relevant: [], supporting_relevant: [] }], []));
});
