import { NextResponse } from "next/server";
import OpenAI from "openai";
import { answerQuestion, streamAnswer } from "@/lib/ai/agent";
import { chatStreamResponse } from "@/lib/ai/http-stream";
import { AgentError } from "@/lib/ai/errors";
import { InputError, validateChatInput } from "@/lib/validation";
import { allowRequest } from "@/lib/rate-limit";
import { RequestTiming } from "@/lib/request-timing";
import {clientBucket, chatSlots, allowGlobalRequest} from "@/lib/request-protection";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 40000;
const headers = { "Cache-Control": "no-store" };

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new InputError("请求内容为空。");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new InputError("请求内容过长，请开始新对话。"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new InputError("请发送有效的 JSON 请求。"); }
}

export async function POST(request: Request) {
  const timing = new RequestTiming();
  let streaming = false;
  let release: (() => void) | undefined;
  try {
    const origin = request.headers.get("origin");
    // Next may construct request.url with localhost even when the browser uses 127.0.0.1.
    let sameOrigin = true;
    if (origin) {
      try { sameOrigin = new URL(origin).host === request.headers.get("host"); }
      catch { sameOrigin = false; }
    }
    if (!sameOrigin) return NextResponse.json({ error: "不允许跨站请求。" }, { status: 403, headers });
    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "请求需要使用 JSON 格式。" }, { status: 415, headers });
    let ip: string;
    try {ip = clientBucket(request.headers);} catch {return NextResponse.json({error: "请求来源未通过验证。"}, {status: 403, headers});}
    if (!allowRequest(ip)) return NextResponse.json({ error: "请求过于频繁，请稍后再试。" }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
    if (!allowGlobalRequest()) return NextResponse.json({error: "服务暂时繁忙，请稍后重试。"}, {status: 429, headers: {...headers, "Retry-After": "600"}});
    try {
      const { message, history } = validateChatInput(await readBody(request));
      timing.setQueryLength(message.length);
      const slot = chatSlots.acquire();
      if (!slot) return NextResponse.json({error: "服务暂时繁忙，请稍后重试。"}, {status: 429, headers: {...headers, "Retry-After": "5"}});
      release = slot;
      if (request.headers.get("accept")?.includes("application/x-ndjson")) {
        const response = chatStreamResponse(signal => streamAnswer(message, history, timing, signal), timing, request.signal, release);
        streaming = true;
        return response;
      }
      return NextResponse.json(await answerQuestion(message, history, timing, request.signal), { headers });
    } catch (error) {
      timing.status = "request_failed";
      if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400, headers });
      if (error instanceof AgentError) return NextResponse.json({ error: "刚才回答生成失败了，请再试一次。" }, { status: error.status, headers });
      if (error instanceof OpenAI.APIError) {
        // Never send provider error bodies, request contents or secrets to the browser/log.
        const status = error.status === 429 ? 429 : 502;
        return NextResponse.json({ error: status === 429 ? "服务暂时繁忙，请稍后重试。" : "刚才回答生成失败了，请再试一次。" }, { status, headers });
      }
      return NextResponse.json({ error: "服务暂时不可用，请稍后重试。" }, { status: 500, headers });
    }
  } finally { if (!streaming) {release?.(); timing.finish();} }
}
