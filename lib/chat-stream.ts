import type {ChatFrame} from "./shared";
import {safeStreamError} from "./stream-diagnostics";
// UTF-8 and NDJSON boundaries are independent of network chunk boundaries.
export async function consumeChatStream(response: Response, onFrame: (frame: ChatFrame) => void, trace?: (stage: string, fields?: Record<string, string | number | boolean | null>) => void) {
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("回答连接异常，请重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", done = false, sawSources = false;
  let chunkCount = 0;
  trace?.("reader_started");
  const parse = (line: string) => {
    if (!line.trim()) return;
    let frame: ChatFrame;
    try {frame = JSON.parse(line) as ChatFrame;}
    catch (error) {trace?.("parse_error", safeStreamError(error)); throw error;}
    if (done) throw new Error("Unexpected frame after done");
    switch (frame.type) {
      case "meta": if (typeof frame.requestId !== "string") throw new Error("Invalid meta"); break;
      case "answer_delta": if (typeof frame.delta !== "string") throw new Error("Invalid delta"); break;
      case "sources": if (typeof frame.answer !== "string" || !Array.isArray(frame.sources)) throw new Error("Invalid sources"); sawSources = true; break;
      case "error": if (typeof frame.message !== "string") throw new Error("Invalid error"); break;
      case "timing": break;
      case "done": if (typeof frame.success !== "boolean" || frame.success && !sawSources) throw new Error("Missing Sources"); done = true; break;
      default: throw new Error("Invalid frame");
    }
    onFrame(frame);
  };
  try {
    while (true) {
      const next = await reader.read();
      if (!next.done) {chunkCount++; if (chunkCount === 1 || chunkCount % 32 === 0) trace?.("client_chunk", {chunkCount, lastChunkTimestamp: Date.now()});}
      pending += next.done ? decoder.decode() : decoder.decode(next.value, {stream: true});
      if (pending.length > 200000) throw new Error("Oversized frame");
      let boundary: number;
      while ((boundary = pending.indexOf("\n")) >= 0) {const line = pending.slice(0, boundary); pending = pending.slice(boundary + 1); parse(line);}
      if (next.done) {trace?.("reader_done", {chunkCount}); break;}
    }
    // EOF may delimit a valid final frame even when the last newline is omitted.
    if (pending.trim()) parse(pending);
    if (!done) throw new Error("回答生成中断，请重试。");
  } catch (error) {trace?.("reader_error", {...safeStreamError(error), chunkCount}); throw error;}
  finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
}
