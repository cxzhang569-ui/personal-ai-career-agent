import test from "node:test";
import assert from "node:assert/strict";
import {consumeChatStream} from "../lib/chat-stream";
import {chatStreamResponse} from "../lib/ai/http-stream";
import {reliableStream} from "../lib/ai/reliability";
import {RequestTiming} from "../lib/request-timing";
import {safeStreamError, safeAbortReason} from "../lib/stream-diagnostics";
import type {ChatFrame} from "../lib/shared";

const frames: ChatFrame[] = [{type:"answer_delta",delta:'中文 😀\n"quote" \\ **Markdown**'}, {type:"sources",answer:"完整",sources:[]},{type:"done",success:true}];
const wire = frames.map(f=>JSON.stringify(f)).join("\n");
const headers = {"content-type":"application/x-ndjson"};
async function read(parts: Uint8Array[]) {
  const seen: ChatFrame[] = [];
  await consumeChatStream(new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(p);c.close();}}),{headers}),f=>seen.push(f));
  return seen;
}
test("parser: frame split into three chunks", async()=>{
  const bytes=new TextEncoder().encode(wire+"\n");
  assert.deepEqual(await read([bytes.slice(0,7),bytes.slice(7,23),bytes.slice(23)]),frames);
});
test("parser: three frames merged into one chunk",async()=>assert.deepEqual(await read([new TextEncoder().encode(wire+"\n")]),frames));
test("parser: multibyte UTF-8 split at every byte",async()=>assert.deepEqual(await read([...new TextEncoder().encode(wire+"\n")].map(b=>new Uint8Array([b]))),frames));
test("parser: final frame with and without newline",async()=>{
  for(const ending of ["","\n"])assert.deepEqual(await read([new TextEncoder().encode(wire+ending)]),frames);
});
test("parser: blank lines and long escaped delta do not break frames",async()=>{
  assert.deepEqual(await read([new TextEncoder().encode("\n"+wire.replaceAll("\n","\n\n")+"\n\n")]),frames);
  const long={type:"answer_delta",delta:"中\\\n\"😀".repeat(3000)};
  assert.equal((await read([new TextEncoder().encode(JSON.stringify(long)+"\n"+wire+"\n")])).length,4);
});
test("parser: partial JSON then reader error is preserved and rejected",async()=>{
  const seen: ChatFrame[]=[]; let reads=0;
  const body=new ReadableStream({pull(c){if(reads++===0)c.enqueue(new TextEncoder().encode('{"type":"answer_delta","delta":"已收到"}\n{"type":'));else c.error(new Error("socket closed"));}});
  await assert.rejects(consumeChatStream(new Response(body,{headers}),f=>seen.push(f)),/socket closed/);
  assert.deepEqual(seen,[{type:"answer_delta",delta:"已收到"}]);
  await assert.rejects(read([new TextEncoder().encode('{"type":')]),SyntaxError);
});
test("diagnostics redact provider messages, causes and arbitrary abort reasons",()=>{
  assert.ok(!JSON.stringify(safeStreamError(Object.assign(new Error("SECRET"),{cause:{code:"ECONNRESET",message:"SECRET"}}))).includes("SECRET"));
  assert.equal(safeStreamError({cause:{code:"UND_ERR_SOCKET"}}).errorCode,"UND_ERR_SOCKET");
  assert.equal(safeAbortReason("SECRET"),"request_abort");
  assert.equal(safeAbortReason(new DOMException("inactivity_timeout","TimeoutError")),"inactivity_timeout");
});
test("stream success/error finalize once; frames never follow done",async()=>{
  for(const fail of [false,true]){
    const timing=new RequestTiming();
    const response=chatStreamResponse(async function*(){yield {type:"answer_delta",delta:"partial"};if(fail)throw new Error("private");yield {type:"result",response:{answer:"complete",sources:[]}};},timing);
    const seen:ChatFrame[]=[]; await consumeChatStream(response,f=>seen.push(f));
    assert.equal(seen.filter(f=>f.type==="done").length,1);
    assert.equal(seen.filter(f=>f.type==="error").length,Number(fail));
    assert.equal(timing.traceEvents.filter(e=>e.stage==="client_stream_close").length,1);
    assert.equal(seen.at(-1)?.type,"done");
  }
});
test("cancel blocks late writes, aborts only active work; fresh retry request remains live",async()=>{
  let signalA:AbortSignal|undefined, release!:()=>void;
  const gate=new Promise<void>(r=>{release=r;});
  const a=new RequestTiming();
  const response=chatStreamResponse(async function*(signal){signalA=signal;yield {type:"answer_delta",delta:"partial"};await gate;yield {type:"result",response:{answer:"late",sources:[]}};},a);
  const reader=response.body!.getReader();await reader.read();await reader.read();
  await reader.cancel("user_stop");await reader.cancel("user_stop");
  assert.equal(signalA!.aborted,true);
  let signalB:AbortSignal|undefined;
  const b=new RequestTiming();const next=chatStreamResponse(async function*(signal){signalB=signal;yield {type:"result",response:{answer:"new",sources:[]}};},b);
  release(); const seen:ChatFrame[]=[];await consumeChatStream(next,f=>seen.push(f));
  await new Promise(r=>setTimeout(r,0));
  assert.notEqual(a.requestId,b.requestId);assert.notEqual(signalA,signalB);assert.equal(signalB!.aborted,false);
  assert.equal(a.traceEvents.filter(e=>e.stage==="client_stream_cancel").length,1);
  assert.equal(a.traceEvents.filter(e=>e.stage==="sources_sent"||e.stage==="done_sent"||e.stage==="client_stream_close").length,0);
  assert.equal(a.traceEvents.filter(e=>e.stage==="request_finalized").length,1);
  assert.deepEqual(seen.at(-1),{type:"done",success:true});
});
test("deadline evidence: inactivity, total, and no false timeout with active deltas",async()=>{
  for(const kind of ["inactivity","total","active"]){
    const stages:string[]=[]; let visible=false;
    const open=async()=> (async function*(){for(let i=0;i<8;i++){yield i;visible=true;await new Promise(r=>setTimeout(r,kind==="inactivity"?40:5));}})();
    const collect=async()=>{const rows=[];for await(const x of reliableStream(open,{startMs:100,inactivityMs:kind==="inactivity"?10:100,totalMs:kind==="total"?18:300,canRetry:()=>!visible,onEvent:s=>stages.push(s)}))rows.push(x);return rows;};
    if(kind==="active"){assert.equal((await collect()).length,8);assert.ok(!stages.some(s=>s.endsWith("_timeout_triggered")));}
    else{await assert.rejects(collect(),{name:"TimeoutError"});assert.ok(stages.includes(kind+"_timeout_triggered"));}
  }
});
