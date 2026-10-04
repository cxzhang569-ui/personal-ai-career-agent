import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCandidate, summarizeCandidates, recallAt } from "../eval/candidate-metrics";
import type { GradedQuestion } from "../eval/graded-metrics";
import type { SearchResult } from "../lib/rag/types";
const p = {source: "projects.md", section: "Architecture"};
const s = {source: "profile.md", section: "Overview"};
const q: GradedQuestion = {id: "q", question: "How?", category: "project", evaluation_type: "retrieval", should_have_answer: true, primary_relevant: [p], supporting_relevant: [s]};
const m = (e: typeof p): SearchResult => ({id: JSON.stringify(e), content: "", score: .8, metadata: {...e, type: "test"}});
test("candidate: supporting rank differs from primary; exact section pair", () => {
  const r = evaluateCandidate(q, [m(s), m({source: "other.md", section: p.section}), m(p)])!;
  assert.equal(r.first_primary_rank, 3); assert.equal(r.first_relevant_rank, 1);
  assert.equal(recallAt(r.first_primary_rank, 1), 0); assert.equal(recallAt(r.first_relevant_rank, 1), 1);
});
test("candidate: boundaries, >K and Top-30 absence", () => {
  const r = evaluateCandidate(q, [...Array.from({length: 10}, () => m(s)), m(p)])!;
  assert.equal(r.first_primary_rank, 11); assert.equal(r.failure_class, "B");
  assert.equal(recallAt(11, 10), 0); assert.equal(recallAt(11, 20), 1);
  const absent = evaluateCandidate(q, [...Array.from({length: 30}, () => m(s)), m(p)])!;
  assert.equal(absent.first_primary_rank, null); assert.equal(absent.failure_class, "D");
  assert.equal(summarizeCandidates([absent]).primaryRankDistribution[">30"], 1);
  for (const k of [5, 10, 20, 30]) assert.equal(recallAt(k, k), 1);
});
test("candidate: multiple primary sections and unique section recall", () => {
  const r = evaluateCandidate({...q, primary_relevant: [p, {...p, section: "Pipeline"}]}, [m(p), m(p), m(s)])!;
  assert.equal(r.first_primary_rank, 1); assert.equal(r.primary_section_recall[5], .5);
  assert.equal(r.relevant_section_recall[5], 2 / 3);
});
test("candidate: empty primary excluded, unknown skipped", () => {
  const combined = evaluateCandidate({...q, primary_relevant: []}, [m(s)])!;
  const regular = evaluateCandidate(q, [m(p)])!;
  assert.equal(combined.failure_class, null); assert.equal(combined.primary_section_recall[5], null);
  const summary = summarizeCandidates([combined, regular]);
  assert.equal(summary.primarySampleCount, 1); assert.equal(summary.relevantSampleCount, 2);
  assert.equal(summary.primaryRecallAt5, 1); assert.equal(summary.relevantRecallAt5, 1);
  assert.equal(evaluateCandidate({...q, evaluation_type: "unknown", should_have_answer: false, primary_relevant: [], supporting_relevant: []}, [m(p)]), null);
  assert.equal(summarizeCandidates([]).primaryRecallAt5, null);
});
