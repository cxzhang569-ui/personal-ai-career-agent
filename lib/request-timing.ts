import "server-only";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {safeStreamError} from "./stream-diagnostics";

export interface StreamTraceEvent {requestId: string; timestamp: string; elapsedMs: number; stage: string; attempt: number; status: string; [key: string]: string | number | boolean | null}

type Phase = "request_received" | "query_rewrite_start" | "query_rewrite_end" | "vector_search_start" | "vector_search_end" | "rerank_start" | "rerank_end" | "retrieval_finished" | "llm_start" | "first_token" | "llm_end" | "response_end";
export interface TimingRecord {
  requestId: string; events: Partial<Record<Phase, number>>; queryLength: number;
  queryRewriteMs: number; vectorSearchMs: number; rerankMs: number; retrievalTotalMs: number; llmMs: number; requestTotalMs: number;
  usedReranker: boolean; rerankerFallback: boolean; reason: string | null; timeToFirstTokenMs: number | null;
  requestReceivedAt: number; retrievalFinishedAt: number | null; deepSeekRequestStartedAt: number | null; firstTokenAt: number | null; streamFinishedAt: number;
  deepSeekTTFTMs: number | null; requestTTFTMs: number | null; generationMs: number | null;
  deepSeekAttempts: number; retryCount: number; upstreamStatus: number | null; status: string;
  trace: StreamTraceEvent[];
}
const observers = new Set<(record: TimingRecord) => void>();
export function observeTimings(observer: (record: TimingRecord) => void) { observers.add(observer); return () => {observers.delete(observer);}; }
export class RequestTiming {
  private start = performance.now();
  private events: Partial<Record<Phase, number>> = {};
  readonly requestId = randomUUID();
  private receivedAt = Date.now();
  private finished?: TimingRecord;
  deepSeekAttempts = 0;
  upstreamStatus: number | null = null;
  status = "success";
  usedReranker = false;
  rerankerFallback = false;
  reason: string | null = null;
  readonly traceEvents: StreamTraceEvent[] = [];
  trace(stage: string, fields: Record<string, string | number | boolean | null> = {}) {
    const event: StreamTraceEvent = {requestId: this.requestId, timestamp: new Date().toISOString(), elapsedMs: performance.now() - this.start, stage, attempt: this.deepSeekAttempts, status: this.status, ...fields};
    this.traceEvents.push(event);
    console.info("chat_trace", JSON.stringify(event));
  }
  traceError(stage: string, error: unknown) {this.trace(stage, safeStreamError(error));}
  constructor(private queryLength = 0) { this.mark("request_received"); }
  mark(phase: Phase) { if (phase === "first_token" && this.events.first_token !== undefined) return; this.events[phase] = performance.now() - this.start; }
  setQueryLength(length: number) { this.queryLength = length; }
  finish(): TimingRecord {
    if (this.finished) return this.finished;
    // Capture elapsed failed phases too; no provider error bodies are retained.
    if (this.events.llm_start !== undefined && this.events.llm_end === undefined) this.mark("llm_end");
    if (this.events.query_rewrite_start !== undefined && this.events.query_rewrite_end === undefined) this.mark("query_rewrite_end");
    this.mark("response_end");
    const duration = (a: Phase, b: Phase) => this.events[a] === undefined || this.events[b] === undefined ? 0 : this.events[b]! - this.events[a]!;
    const vectorSearchMs = duration("vector_search_start", "vector_search_end");
    const rerankMs = duration("rerank_start", "rerank_end");
    const first = this.events.first_token;
    const at = (phase: Phase) => this.events[phase] === undefined ? null : this.receivedAt + this.events[phase]!;
    const record: TimingRecord = {requestId: this.requestId, events: {...this.events}, queryLength: this.queryLength,
      queryRewriteMs: duration("query_rewrite_start", "query_rewrite_end"), vectorSearchMs, rerankMs, retrievalTotalMs: vectorSearchMs + rerankMs,
      llmMs: duration("llm_start", "llm_end"), requestTotalMs: this.events.response_end!, usedReranker: this.usedReranker,
      rerankerFallback: this.rerankerFallback, reason: this.reason, timeToFirstTokenMs: first ?? null,
      requestReceivedAt: this.receivedAt, retrievalFinishedAt: at("retrieval_finished"), deepSeekRequestStartedAt: at("llm_start"), firstTokenAt: at("first_token"), streamFinishedAt: at("response_end")!,
      requestTTFTMs: first ?? null, deepSeekTTFTMs: first === undefined ? null : duration("llm_start", "first_token"), generationMs: first === undefined ? null : duration("first_token", "llm_end"),
      deepSeekAttempts: this.deepSeekAttempts, retryCount: Math.max(0, this.deepSeekAttempts - 1), upstreamStatus: this.upstreamStatus, status: this.status, trace: [...this.traceEvents]};
    this.finished = record;
    // Explicit fields only: no request body, prompt, credentials, vectors or excerpts.
    console.info("chat_timing", JSON.stringify(record));
    for (const observer of observers) {try {observer(record);} catch { /* Diagnostics cannot fail a chat response. */ }}
    return record;
  }
}
