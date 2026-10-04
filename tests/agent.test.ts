import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readKnowledge } from "../lib/rag/knowledge";
import { answerQuestion } from "../lib/ai/agent";
import { searchKnowledgeBase } from "../lib/rag/search";
import { embedTexts, embeddingModel, embeddingBaseURL } from "../lib/rag/embed";

test("agent integration: empty KB, retrieval, allowlisted citations, stale index", async () => {
  const cwd = process.cwd();
  const savedEnv = { KNOWLEDGE_DIR: process.env.KNOWLEDGE_DIR, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL };
  const originalFetch = globalThis.fetch;
  const state = globalThis as typeof globalThis & {__careerBgeExtractor?: unknown};
  const originalExtractor = state.__careerBgeExtractor;
  state.__careerBgeExtractor = Promise.resolve(async (texts: string[]) => ({tolist: () => texts.map(() => [1, ...Array(511).fill(0)])}));
  const directory = await mkdtemp(path.join(os.tmpdir(), "career-agent-test-"));
  try {
    process.chdir(directory);
    process.env.KNOWLEDGE_DIR = "knowledge";
    process.env.DEEPSEEK_API_KEY = "test-deepseek-placeholder";
    delete process.env.DEEPSEEK_MODEL;
    await mkdir("knowledge"); await mkdir("data");
    await writeFile("knowledge/projects.md", "<!-- draft -->\n# Projects\nSummary:");
    let knowledge = await readKnowledge();
    async function saveIndex() {
      const embeddings = await embedTexts(knowledge.chunks.map(chunk => chunk.content));
      await writeFile("data/embeddings.json", JSON.stringify({ version: 1, model: embeddingModel(), provider: embeddingBaseURL(), fingerprint: knowledge.fingerprint, chunks: knowledge.chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] })) }));
    }
    await saveIndex();
    let calls = 0;
    let invalidCitation = false;
    const mockDeepSeekFetch: typeof fetch = async (input, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(String(input), "https://api.deepseek.com/chat/completions");
      assert.equal(body.model, "deepseek-flash");
      if (!body.response_format) return Response.json({ choices: [{ message: { content: "RAG 项目中的 Python 检索实现" } }] });
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.match(body.messages[0].content, /Never invent/);
      const context = JSON.parse(body.messages[1].content);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: "他在 RAG 项目中使用 Python 实现检索。", usedSourceIds: [invalidCitation ? "unknown-source" : context.knowledgeExcerpts[0].id] }) } }] });
    };
    globalThis.fetch = mockDeepSeekFetch;
    const empty = await answerQuestion("介绍他", []);
    assert.match(empty.answer, /没有足够的信息/);
    assert.deepEqual(empty.sources, []);
    assert.equal(calls, 0);
    await writeFile("knowledge/projects.md", "# Projects\n## RAG\n使用 Python 实现检索。");
    // Load local model before intercepting fetch: the interception below permits only DeepSeek.
    knowledge = await readKnowledge();
    globalThis.fetch = originalFetch;
    await saveIndex();
    globalThis.fetch = mockDeepSeekFetch;
    const matches = await searchKnowledgeBase("Python");
    assert.ok(matches[0].score > 0 && matches[0].score <= 1.000001);
    const answer = await answerQuestion("他的 Python 能力怎么样？", []);
    assert.equal(answer.sources[0].source, "projects.md");
    assert.equal(answer.sources[0].section, "RAG");
    assert.ok(!("embedding" in answer.sources[0]));
    const followup = await answerQuestion("详细说说这个项目", [{ role: "user", content: "他的 Python 能力怎么样？" }, { role: "assistant", content: answer.answer }]);
    assert.equal(followup.sources[0].source, "projects.md");
    invalidCitation = true;
    await assert.rejects(answerQuestion("介绍项目", []), /来源无效/);
    await writeFile("knowledge/projects.md", "# Changed\n新资料");
    await assert.rejects(answerQuestion("介绍项目", []), /重新生成索引/);
  } finally {
    state.__careerBgeExtractor = originalExtractor;
    globalThis.fetch = originalFetch; process.chdir(cwd);
    for (const [name, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
