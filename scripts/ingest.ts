import { loadEnvConfig } from "@next/env";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readKnowledge } from "../lib/rag/knowledge";
import { embedTexts, embeddingBaseURL, embeddingModel } from "../lib/rag/embed";
import type { EmbeddedChunk, KnowledgeIndex } from "../lib/rag/types";

async function main() {
  loadEnvConfig(process.cwd());
  const knowledge = await readKnowledge();
  const chunks: EmbeddedChunk[] = [];
  for (let offset = 0; offset < knowledge.chunks.length; offset += 32) {
    const batch = knowledge.chunks.slice(offset, offset + 32);
    const embeddings = await embedTexts(batch.map((chunk) => chunk.content));
    if (embeddings.length !== batch.length || embeddings.some((vector) => !vector.length || !vector.every(Number.isFinite))) throw new Error("本地 BGE 返回了无效的向量。");
    chunks.push(...batch.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] })));
    console.log(`已生成 ${chunks.length}/${knowledge.chunks.length} 个知识片段的向量。`);
  }
  const index: KnowledgeIndex = { version: 1, model: embeddingModel(), provider: embeddingBaseURL(), fingerprint: knowledge.fingerprint, generatedAt: new Date().toISOString(), chunks };
  const directory = path.join(process.cwd(), "data");
  await mkdir(directory, { recursive: true });
  const temp = path.join(directory, "embeddings.json.tmp");
  await writeFile(temp, JSON.stringify(index, null, 2), "utf8");
  // Replace only after all local encoding batches succeed, preserving the previous index on failure.
  await rename(temp, path.join(directory, "embeddings.json"));
  console.log(chunks.length ? `完成：data/embeddings.json，${chunks.length} 个片段。请重新构建/部署网站。` : "完成：空知识库索引。模板处于 draft 状态，填写并删除 draft 标记后重新运行 ingestion。");
}
main().catch(() => { console.error("Ingestion 失败，旧索引已保留。请检查本地 BGE 模型缓存、首次下载网络、CPU 运行环境及知识库文件后重试；Embedding 无需 API Key。"); process.exitCode = 1; });
