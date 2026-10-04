import {readFile, mkdir, writeFile} from "node:fs/promises";
import {loadKnowledgeIndex} from "../lib/rag/search";
import {searchVector} from "../lib/rag/vector-experiment";
import {searchBM25} from "../lib/rag/bm25";
import {searchHybrid} from "../lib/rag/hybrid";
import {evaluateGradedQuestion, summarizeGraded, validateGradedDataset} from "../eval/graded-metrics";
import {evaluateCandidate, summarizeCandidates} from "../eval/candidate-metrics";
import {runRerankerExperiment, candidateSizes} from "../lib/rag/reranker-pareto-experiment";
import {prepareReranker} from "../lib/rag/reranker";
import {statistics} from "../eval/reranker-pareto-metrics";

async function main() {
  const mode=process.argv[2] || "vector";
  if(!["vector","compare","candidate","reranker","pareto"].includes(mode)) throw Error("Unknown evaluation mode.");
  const index=await loadKnowledgeIndex();
  const dataset: unknown=JSON.parse(await readFile("eval/public/example-rag-eval.json","utf8"));
  validateGradedDataset(dataset,index.chunks.map(c=>c.metadata));
  // Preparation may download the existing pinned reranker, but generation is never called.
  if(mode==="reranker"||mode==="pareto") await prepareReranker();
  globalThis.fetch=async()=>{throw Error("Evaluation inference is offline.");};
  const results: Record<string,unknown>={};
  const vector=await Promise.all(dataset.map(async q=>evaluateGradedQuestion(q,await searchVector(q.question,5,index))));
  results.vector={summary:summarizeGraded(vector),results:vector};
  if(mode==="compare") for(const [name,search] of [["bm25",searchBM25],["hybrid",searchHybrid]] as const) {
    const rows=[];for(const q of dataset) rows.push(evaluateGradedQuestion(q,await search(q.question,5,index)));
    results[name]={summary:summarizeGraded(rows),results:rows};
  }
  if(mode==="candidate") {
    const rows=[];for(const q of dataset) {const row=evaluateCandidate(q,await searchVector(q.question,30,index));if(row)rows.push(row);}
    results.candidate={summary:summarizeCandidates(rows),results:rows};
  }
  if(mode==="reranker"||mode==="pareto") for(const n of mode==="pareto"?candidateSizes:[20]) {
    const questions=dataset.filter(q=>q.evaluation_type==="retrieval");
    await runRerankerExperiment(questions[0].question,{candidateTopN:n,finalTopK:5},index);
    const runs=[];const rows=[];
    for(const q of questions) {const run=await runRerankerExperiment(q.question,{candidateTopN:n,finalTopK:5},index);runs.push(run);rows.push(evaluateGradedQuestion(q,run.final));}
    results["candidate"+n]={summary:summarizeGraded(rows),latency:statistics(runs.map(r=>r.latency.rerankMs)),results:rows};
  }
  await mkdir(".cache/evaluation",{recursive:true});
  await writeFile(`.cache/evaluation/${mode}.json`,JSON.stringify({dataset:"fictional-example",generatedAt:new Date().toISOString(),results},null,2)+"\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name,r])=>[name,(r as {summary:unknown}).summary])),null,2));
  console.log("Synthetic demo evaluation; not a reproduction of private historical scores. Unknown detection is not evaluated.");
}
main().catch(()=>{console.error("Example evaluation failed. Prepare the model and run ingest for the matching example knowledge directory.");process.exitCode=1;});
