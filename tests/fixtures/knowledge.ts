import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {readKnowledge} from "../../lib/rag/knowledge";
import {embeddingModel,embeddingBaseURL} from "../../lib/rag/embed";
export async function syntheticKnowledgeFixture() {
  const cwd=process.cwd();const env=process.env.KNOWLEDGE_DIR;
  const directory=await mkdtemp(path.join(tmpdir(),"career-synthetic-"));
  await mkdir(path.join(directory,"knowledge"));await mkdir(path.join(directory,"data"));
  await writeFile(path.join(directory,"knowledge","projects.md"),"# Fictional Projects\n## Campus Study Assistant\n这是完全虚构的课程问答工具，提供有来源的检索回答。");
  const kb=await readKnowledge(path.join(directory,"knowledge"));
  await writeFile(path.join(directory,"data","embeddings.json"),JSON.stringify({version:1,model:embeddingModel(),provider:embeddingBaseURL(),fingerprint:kb.fingerprint,chunks:kb.chunks.map(c=>({...c,embedding:[1,...Array(511).fill(0)]}))}));
  process.chdir(directory);process.env.KNOWLEDGE_DIR="knowledge";
  return async()=>{process.chdir(cwd);if(env===undefined)delete process.env.KNOWLEDGE_DIR;else process.env.KNOWLEDGE_DIR=env;await rm(directory,{recursive:true,force:true});};
}
