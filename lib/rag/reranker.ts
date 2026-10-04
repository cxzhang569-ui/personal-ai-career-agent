import "server-only";
import path from "node:path";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { PreTrainedTokenizer, PreTrainedModel } from "@huggingface/transformers";
import type { SearchResult } from "./types";
import { rerankerExperiment as config } from "./reranker-experiment-config";

export interface RerankedResult extends SearchResult { rerankScore: number; originalRank: number }
export type PairScorer = (query: string, documents: string[]) => Promise<number[]>;

// Injectable loader lets tests verify reuse without loading real weights.
export function cachedLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => pending ??= load().catch(error => { pending = undefined; throw error; });
}

export async function rerankWithScorer(query: string, candidates: SearchResult[], scorer: PairScorer, topK: number = config.finalTopK): Promise<RerankedResult[]> {
  if (!Number.isInteger(topK) || topK < 1) throw new Error("topK must be a positive integer.");
  if (new Set(candidates.map(c => c.id)).size !== candidates.length) throw new Error("Duplicate candidate IDs.");
  if (!candidates.length) return [];
  const scores = await scorer(query, candidates.map(c => c.content));
  if (scores.length !== candidates.length || !scores.every(Number.isFinite)) throw new Error("Invalid reranker scores.");
  return candidates.map((c, i) => ({...c, originalRank: i + 1, rerankScore: scores[i]}))
    .sort((a, b) => b.rerankScore - a.rerankScore || a.originalRank - b.originalRank).slice(0, topK);
}

const directory = path.join(process.cwd(), ".cache", "transformers", config.onnxModel, config.revision);
const files = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
let coldStart: { downloadMs: number; loadMs: number; totalMs: number; downloadedFiles: number; modelBytes: number } | undefined;

const loadModel = cachedLoader(async () => {
  if (typeof window !== "undefined") throw new Error("Reranker must run server-side.");
  const start = performance.now();
  let downloadedFiles = 0;
  for (const file of files) {
    const destination = path.join(directory, file);
    try { await access(destination); continue; } catch { /* Prepare missing public model files. */ }
    await mkdir(path.dirname(destination), {recursive: true});
    const temporary = `${destination}.tmp.${process.pid}`;
    try {
      console.log(`Preparing reranker: ${file}`);
      const response = await fetch(`https://huggingface.co/${config.onnxModel}/resolve/${config.revision}/${file}`, {signal: AbortSignal.timeout(600000)});
      if (!response.ok || !response.body) throw new Error(`Reranker download failed: ${file} (${response.status}).`);
      async function* chunks() {
        const reader = response.body!.getReader();
        try { while (true) { const {done, value} = await reader.read(); if (done) break; yield value; } }
        finally { reader.releaseLock(); }
      }
      await writeFile(temporary, chunks());
      await rename(temporary, destination);
      downloadedFiles++;
    } finally { await rm(temporary, {force: true}); }
  }
  const downloaded = performance.now();
  const { AutoTokenizer, AutoModelForSequenceClassification } = await import("@huggingface/transformers");
  const tokenizer: PreTrainedTokenizer = await AutoTokenizer.from_pretrained(directory, {local_files_only: true});
  const model: PreTrainedModel = await AutoModelForSequenceClassification.from_pretrained(directory, {local_files_only: true, device: config.device, dtype: config.dtype});
  const modelBytes = (await stat(path.join(directory, "onnx/model_quantized.onnx"))).size;
  coldStart = {downloadMs: downloaded - start, loadMs: performance.now() - downloaded, totalMs: performance.now() - start, downloadedFiles, modelBytes};
  return {tokenizer, model};
});

export async function prepareReranker() { await loadModel(); return {...coldStart!}; }

const scorePairs: PairScorer = async (query, documents) => {
  const {tokenizer, model} = await loadModel();
  const scores: number[] = [];
  for (let start = 0; start < documents.length; start += config.batchSize) {
    const batch = documents.slice(start, start + config.batchSize);
    // Joint pair encoding, not separate embeddings; raw single-label logits.
    const inputs = tokenizer(batch.map(() => query), {text_pair: batch, padding: true, truncation: true, max_length: config.maxLength});
    const output = await model(inputs);
    const logits = output.logits;
    if (logits.dims.length !== 2 || logits.dims[0] !== batch.length || logits.dims[1] !== 1) throw new Error("Expected single-logit cross-encoder output.");
    scores.push(...Array.from(logits.data as Float32Array));
  }
  return scores;
};

export function rerank(query: string, candidates: SearchResult[], topK: number = config.finalTopK): Promise<RerankedResult[]> {
  return rerankWithScorer(query, candidates, scorePairs, topK);
}
