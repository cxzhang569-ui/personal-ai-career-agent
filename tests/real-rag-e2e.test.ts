import test from "node:test";
import assert from "node:assert/strict";
import { safeRanking, sourceDiagnostics, compareSources, summarizeE2E } from "../eval/real-rag-e2e-metrics";
import type { GradedQuestion } from "../eval/graded-metrics";

test("E2E report ranking strips content/embedding and keeps actual reranker scores/ranks", () => {
  const row = {id: "c", content: "private content", embedding: [1, 2], score: 0.6, rerankScore: 4.2, originalRank: 10, metadata: {source: "projects.md", section: "Architecture", type: "project"}};
  const result = safeRanking([row])[0];
  assert.equal(result.originalVectorRank, 10); assert.equal(result.rerankScore, 4.2);
  assert.ok(!JSON.stringify(result).includes("private")); assert.ok(!("embedding" in result));
});
test("E2E Sources use exact pairs, detect regression even with gained supporting evidence", () => {
  const label: GradedQuestion = {id: "q", question: "q", category: "project", evaluation_type: "retrieval", should_have_answer: true,
    primary_relevant: [{source: "projects.md", section: "Architecture"}], supporting_relevant: [{source: "skills.md", section: "RAG"}]};
  const primary = [{id: "a", source: "projects.md", section: "Architecture"}];
  const supporting = [{id: "b", source: "skills.md", section: "RAG"}];
  const a = sourceDiagnostics(primary, label), b = sourceDiagnostics(supporting, label);
  assert.equal(compareSources(a, b, ["a"], ["b"]), "Potential Regression");
  assert.equal(compareSources(b, a, ["b"], ["a"]), "Improved");
  assert.equal(compareSources(a, a, ["a"], ["a"]), "Same");
  assert.equal(sourceDiagnostics([{id: "x", source: "projects.md", section: "Other"}], label).relevantSectionPresent, false);
  assert.equal(sourceDiagnostics([...primary, ...primary], label).duplicateSources, true);
});
test("E2E latency shares use totals and answer lengths are measured independently", () => {
  const result = summarizeE2E([{timing: {requestTotalMs: 1000, deepSeekMs: 700, retrievalTotalMs: 200, rerankMs: 180, vectorSearchMs: 20}, answerChars: 50, fallback: false},
    {timing: {requestTotalMs: 2000, deepSeekMs: 1500, retrievalTotalMs: 400, rerankMs: 380, vectorSearchMs: 20}, answerChars: 150, fallback: true}]);
  assert.equal(result.retrievalShareOfTotal, 0.2); assert.equal(result.meanAnswerChars, 100); assert.equal(result.fallbackCount, 1);
});
