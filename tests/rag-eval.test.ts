import test from "node:test";
import assert from "node:assert/strict";
import { evaluateQuestion, summarize, validateDataset, type EvalQuestion } from "../eval/metrics";
import type { SearchResult } from "../lib/rag/types";

const question: EvalQuestion = {
  id: "positive", category: "rag", question: "项目有什么检索证据？", should_have_answer: true,
  expected_sources: ["projects.md", "skills.md"], expected_sections: ["Architecture", "RAG Evidence"],
  expected_evidence: [{ source: "projects.md", section: "Architecture" }, { source: "skills.md", section: "RAG Evidence" }],
};
const match = (source: string, section: string, score = 0.8): SearchResult => ({ id: `${source}/${section}`, content: "evidence", metadata: { source, section, type: "test" }, score });
const negative: EvalQuestion = { id: "negative", category: "negative", question: "你的 GPA 是多少？", should_have_answer: false, expected_sources: [], expected_sections: [], expected_evidence: [] };

test("evaluation: exact source-section pair, rank, Hit@K and reciprocal rank", () => {
  const wrongPair = match("skills.md", "Architecture");
  const result = evaluateQuestion(question, [wrongPair, match("other.md", "Other"), match("projects.md", "Architecture")]);
  assert.equal(result.firstRelevantRank, 3);
  assert.deepEqual([result.hitAt1, result.hitAt3, result.hitAt5], [0, 1, 1]);
  assert.equal(result.reciprocalRank, 1 / 3);
  assert.equal(result.retrieved[0].relevant, false);
  assert.equal(result.pass, true);
  const fifth = evaluateQuestion(question, Array.from({ length: 4 }, () => wrongPair).concat(match("skills.md", "RAG Evidence")));
  assert.deepEqual([fifth.hitAt1, fifth.hitAt3, fifth.hitAt5], [0, 0, 1]);
});

test("evaluation: unique source recall, Top-5 cutoff and empty positives", () => {
  const result = evaluateQuestion(question, [match("projects.md", "Architecture"), match("projects.md", "Other")]);
  assert.equal(result.sourceRecallAt5, 0.5);
  assert.deepEqual(result.missingSources, ["skills.md"]);
  const missing = evaluateQuestion(question, []);
  assert.deepEqual([missing.hitAt1, missing.hitAt3, missing.hitAt5, missing.reciprocalRank, missing.sourceRecallAt5], [0, 0, 0, 0, 0]);
  assert.equal(missing.firstRelevantRank, null);
  assert.equal(missing.pass, false);
  const sixth = evaluateQuestion(question, Array.from({ length: 5 }, () => match("other.md", "Other")).concat(match("projects.md", "Architecture")));
  assert.equal(sixth.firstRelevantRank, null);
});

test("evaluation: negatives use actual acceptance policy, threshold equality and empty results", () => {
  const accepted = evaluateQuestion(negative, [match("education.md", "Education", 0.2)]);
  assert.equal(accepted.pass, false); // Production has no threshold.
  assert.equal(accepted.hitAt5, null);
  assert.equal(accepted.sourceRecallAt5, null);
  assert.equal(evaluateQuestion(negative, [], null).pass, true);
  assert.equal(evaluateQuestion(negative, [match("education.md", "Education", 0.4)], 0.5).pass, true);
  assert.equal(evaluateQuestion(negative, [match("education.md", "Education", 0.5)], 0.5).pass, false);
  assert.equal(evaluateQuestion(question, [match("projects.md", "Architecture", 0.4)], 0.5).hitAt5, 0);
  assert.throws(() => evaluateQuestion(negative, [], Number.NaN));
  assert.throws(() => evaluateQuestion(negative, [match("education.md", "Education", Number.NaN)]));
});

test("evaluation: macro averages exclude negatives; missing sample types return null", () => {
  const first = evaluateQuestion(question, [match("projects.md", "Architecture")]);
  const third = evaluateQuestion({ ...question, id: "third" }, [match("other.md", "Other"), match("other.md", "Other"), match("projects.md", "Architecture"), match("skills.md", "RAG Evidence")]);
  const summary = summarize([first, third, evaluateQuestion(negative, [])]);
  assert.equal(summary.mrr, (1 + 1 / 3) / 2);
  assert.equal(summary.hitAt1, 0.5);
  assert.equal(summary.hitAt3, 1);
  assert.equal(summary.sourceRecallAt5, 0.75);
  assert.equal(summary.negativeRejectionRate, 1);
  assert.equal(summarize([first]).negativeRejectionRate, null);
  assert.equal(summarize([evaluateQuestion(negative, [])]).mrr, null);
  assert.equal(summarize([]).hitAt5, null);
});

test("evaluation: reject stale, duplicate, inconsistent and unknown labels", () => {
  validateDataset([question, negative], question.expected_evidence);
  assert.throws(() => validateDataset([question, question], question.expected_evidence));
  assert.throws(() => validateDataset([question], []));
  assert.throws(() => validateDataset([{ ...question, expected_sources: [] }], question.expected_evidence));
  assert.throws(() => validateDataset([{ ...negative, should_have_answer: true }], []));
  assert.throws(() => validateDataset([{ ...question, should_have_answer: false }], question.expected_evidence));
});
