import "server-only";
import {safeStreamError} from "../stream-diagnostics";
export const retryDelays = [400, 1000] as const;
export function timeoutConfig() {
  const bounded = (name: string, fallback: number) => {const n = Number(process.env[name]); return Number.isInteger(n) && n >= 1000 && n <= 45000 ? n : fallback;};
  return {startMs: bounded("DEEPSEEK_TIMEOUT_MS", 15000), inactivityMs: bounded("DEEPSEEK_INACTIVITY_TIMEOUT_MS", 15000), totalMs: bounded("DEEPSEEK_TOTAL_TIMEOUT_MS", 45000)};
}
export function upstreamStatus(error: unknown): number | null {
  return typeof (error as {status?: unknown})?.status === "number" ? (error as {status: number}).status : null;
}
export function retryable(error: unknown) {
  const status = upstreamStatus(error);
  if (status !== null) return [429, 502, 503, 504].includes(status);
  const name = (error as {name?: string})?.name;
  const code = (error as {code?: string})?.code;
  return ["APIConnectionError", "APIConnectionTimeoutError", "TimeoutError"].includes(name ?? "") || ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"].includes(code ?? "") || error instanceof TypeError;
}
function timeoutError(reason: string) {return new DOMException(reason, "TimeoutError");}
export async function withDeadline<T>(work: Promise<T>, ms: number, controller: AbortController, reason = "startup_timeout", onTimeout?: (reason: string) => void): Promise<T> {
  if (controller.signal.aborted) throw controller.signal.reason;
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", abort, {once: true});
    timer = setTimeout(() => {onTimeout?.(reason); controller.abort(timeoutError(reason));}, Math.max(0, ms));
  });
  try {return await Promise.race([work, deadline]);}
  finally {clearTimeout(timer!); controller.signal.removeEventListener("abort", abort!);}
}
async function pause(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {clearTimeout(timer); reject(signal?.reason);};
    const timer = setTimeout(() => {signal?.removeEventListener("abort", abort); resolve();}, ms);
    signal?.addEventListener("abort", abort, {once: true});
  });
}
export interface ReliabilityOptions {
  signal?: AbortSignal; startMs?: number; inactivityMs?: number; totalMs?: number;
  canRetry?: () => boolean; onAttempt?: (attempt: number) => void; onFailure?: (status: number | null) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onEvent?: (stage: string, fields?: Record<string, string | number | boolean | null>) => void;
}
export async function* reliableStream<T>(open: (signal: AbortSignal) => Promise<AsyncIterable<T>>, options: ReliabilityOptions = {}) {
  const config = {...timeoutConfig(), ...options};
  const end = performance.now() + config.totalMs;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, {once: true});
    if (options.signal?.aborted) abort();
    let iterator: AsyncIterator<T> | undefined;
    options.onAttempt?.(attempt);
    const startupEnd = Math.min(end, performance.now() + config.startMs);
    const timeout = (reason: string) => options.onEvent?.(reason + "_triggered", {triggered: true});
    try {
      const stream = await withDeadline(open(controller.signal), startupEnd - performance.now(), controller, startupEnd === end ? "total_timeout" : "startup_timeout", timeout);
      iterator = stream[Symbol.asyncIterator]();
      let first = true;
      while (true) {
        const next = await withDeadline(iterator.next(), first ? startupEnd - performance.now() : Math.min(config.inactivityMs, end - performance.now()), controller, first ? startupEnd === end ? "total_timeout" : "startup_timeout" : end - performance.now() <= config.inactivityMs ? "total_timeout" : "inactivity_timeout", timeout);
        if (next.done) {options.onEvent?.("upstream_body_closed", {normalEOF: true}); return;}
        first = false;
        yield next.value;
      }
    } catch (error) {
      options.onEvent?.("upstream_stream_error", safeStreamError(error));
      controller.abort("retry_cleanup");
      options.onFailure?.(upstreamStatus(error));
      let delay: number = retryDelays[attempt - 1] ?? 0;
      if (upstreamStatus(error) === 429) {
        const headers = (error as {headers?: Headers}).headers;
        const hint = headers?.get?.("retry-after");
        if (hint) {const seconds = Number(hint); const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(hint) - Date.now(); if (Number.isFinite(ms)) delay = Math.max(delay, ms);}
      }
      if (options.signal?.aborted || attempt === 3 || !retryable(error) || options.canRetry?.() === false || performance.now() + delay >= end) throw error;
      await (options.wait ?? pause)(delay, options.signal);
    } finally {
      controller.abort("attempt_cleanup");
      options.signal?.removeEventListener("abort", abort);
      // Abort releases SDK fetch even if a pending read never resolves.
      void iterator?.return?.().catch(() => {});
    }
  }
}
export async function reliableComplete<T>(call: (signal: AbortSignal) => Promise<T>, options: ReliabilityOptions = {}): Promise<T> {
  const open = async (signal: AbortSignal) => (async function* () {yield await call(signal);})();
  for await (const result of reliableStream(open, options)) return result;
  throw new Error("No completion returned");
}
