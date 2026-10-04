import "server-only";
import type {AgentStreamEvent} from "./agent";
import type {ChatFrame} from "../shared";
import type {RequestTiming} from "../request-timing";
import {safeAbortReason} from "../stream-diagnostics";

export function chatStreamResponse(produce: (signal: AbortSignal) => AsyncIterable<AgentStreamEvent>, timing: RequestTiming, requestSignal?: AbortSignal, onFinish?: () => void) {
  const abort = new AbortController();
  let released = false;
  const release = () => {if (!released) {released = true; onFinish?.();}};
  const onAbort = () => {timing.trace("abort_signal_triggered", {abortReason: "request_abort"}); abort.abort(requestSignal?.reason); release();};
  requestSignal?.addEventListener("abort", onAbort, {once: true});
  if (requestSignal?.aborted) onAbort();
  const limit = setTimeout(() => {timing.trace("total_timeout_triggered", {operation: "http", triggered: true}); abort.abort(new DOMException("total_timeout", "TimeoutError")); release();}, 55000);
  const encoder = new TextEncoder();
  let cancelled = false;
  let firstDelta = true;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: ChatFrame) => {if (!cancelled) {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        if (frame.type === "answer_delta" && firstDelta) {firstDelta = false; timing.trace("first_client_delta_sent");}
        if (frame.type === "sources") timing.trace("sources_sent", {sourceCount: frame.sources.length});
        if (frame.type === "done") timing.trace("done_sent", {success: frame.success});
      }};
      timing.trace("request_received");
      send({type: "meta", requestId: timing.requestId});
      void (async () => {
        let partial = false, success = false;
        try {
          for await (const event of produce(abort.signal)) {
            abort.signal.throwIfAborted();
            if (event.type === "answer_delta") {partial = true; send(event);}
            else {send({type: "sources", ...event.response}); success = true;}
          }
          if (!success) throw new Error("Missing final result");
        } catch (error) {
          success = false;
          timing.status = abort.signal.aborted ? "aborted_or_timeout" : partial ? "stream_interrupted" : "generation_failed";
          timing.traceError("request_error", error);
          send({type: "error", message: partial ? "回答生成中断，请重试。" : "刚才回答生成失败了，请再试一次。", partial, requestId: timing.requestId});
        } finally {
          release();
          clearTimeout(limit); requestSignal?.removeEventListener("abort", onAbort);
          timing.trace(success ? "request_success" : "request_finalized", {success, cancelled, startupTimeoutTriggered: timing.traceEvents.some(e => e.stage === "startup_timeout_triggered"), inactivityTimeoutTriggered: timing.traceEvents.some(e => e.stage === "inactivity_timeout_triggered"), totalTimeoutTriggered: timing.traceEvents.some(e => e.stage === "total_timeout_triggered")});
          const record = timing.finish();
          send({type: "timing", timing: record}); send({type: "done", success});
          if (!cancelled) {controller.close(); timing.trace("client_stream_close");}
        }
      })();
    },
    cancel(reason) {cancelled = true; timing.trace("client_stream_cancel", {abortReason: safeAbortReason(reason)}); abort.abort(new DOMException("client_cancel", "AbortError")); release(); clearTimeout(limit); requestSignal?.removeEventListener("abort", onAbort);},
  });
  return new Response(body, {headers: {"Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Request-ID": timing.requestId}});
}
