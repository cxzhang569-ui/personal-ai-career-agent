import assert from "node:assert/strict";
import {readKnowledge} from "../lib/rag/knowledge";
import {loadKnowledgeIndex, searchKnowledgeBase} from "../lib/rag/search";
async function main() {
  const knowledge=await readKnowledge();const index=await loadKnowledgeIndex();
  assert.equal(index.chunks.length,knowledge.chunks.length);
  assert.equal(new Set(index.chunks.map(c=>c.id)).size,index.chunks.length);
  for(let i=0;i<index.chunks.length;i++) {
    const {embedding,...chunk}=index.chunks[i];assert.deepEqual(chunk,knowledge.chunks[i]);
    assert.equal(embedding.length,512);assert.ok(embedding.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...embedding)-1)<0.0001);
  }
  const queries=[['Campus Study Assistant 解决什么问题？','Campus Study Assistant — Overview'],['Campus Study Assistant 的 RAG 流程是什么？','Campus Study Assistant — Architecture'],['Python 实践','Python']];
  for(const [query,section] of queries) {const matches=await searchKnowledgeBase(query,5,index);assert.ok(matches.some(m=>m.metadata.section===section));console.log(JSON.stringify({query,sections:matches.map(m=>m.metadata.section)}));}
  console.log(`Example retrieval passed: ${index.chunks.length} normalized 512D chunks.`);
}
main().catch(()=>{console.error('Example retrieval validation failed.');process.exitCode=1;});
