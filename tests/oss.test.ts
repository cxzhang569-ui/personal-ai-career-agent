import test from "node:test";
import assert from "node:assert/strict";
import {readKnowledge} from "../lib/rag/knowledge";
import {publicationFiles,scanText} from "../scripts/oss-release.mjs";
import {readFile} from "node:fs/promises";
import {validateGradedDataset} from "../eval/graded-metrics";
test("publication allowlist excludes private material and generated artifacts",async()=>{
  const files=await publicationFiles();
  for(const file of ['.env.local','data/embeddings.json','knowledge/profile.md','eval/private/rag-eval.json','desktop-preview.png'])assert.ok(!files.includes(file));
  assert.ok(files.includes('knowledge/example/profile.md'));assert.ok(files.includes('models/bge-small-zh-v1.5/manifest.json'));
  assert.ok(files.includes('Dockerfile'));assert.ok(files.includes('.github/workflows/ci.yml'));
  assert.equal(files.some(f=>f.endsWith('.onnx')),false);
});
test("release scan detects credentials and identity without returning values",()=>{
  const secret='sk-'+'x'.repeat(40);const findings=scanText(secret);assert.equal(findings[0].type,'credential');assert.ok(!JSON.stringify(findings).includes(secret));
  assert.equal(scanText('DEEPSEEK_API_KEY=your_key_here').length,0);
});
test("fictional dataset labels match actual example section metadata",async()=>{
  const knowledge=await readKnowledge('knowledge/example');assert.ok(knowledge.chunks.length>10);
  const dataset:unknown=JSON.parse(await readFile('eval/public/example-rag-eval.json','utf8'));
  validateGradedDataset(dataset,knowledge.chunks.map(c=>c.metadata));
  assert.equal(dataset.filter(q=>q.evaluation_type==='unknown').length,1);
});
