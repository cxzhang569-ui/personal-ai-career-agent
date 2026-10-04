import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {reliableStream, reliableComplete, retryable, retryDelays, timeoutConfig} from "../lib/ai/reliability";
import {JsonAnswerStream} from "../lib/ai/json-answer-stream";
import {chatStreamResponse} from "../lib/ai/http-stream";
import {RequestTiming} from "../lib/request-timing";
import {consumeChatStream} from "../lib/chat-stream";
import type {ChatFrame} from "../lib/shared";
import {createStreamAnswer} from "../lib/ai/agent";
import {syntheticKnowledgeFixture} from "./fixtures/knowledge";

for (const status of [502,503,504,429,400,401,403]) test(`retry status ${status}: bounded and selective`, async () => {
  let attempts = 0; const delays: number[] = [];
  const open = async () => {if (++attempts === 1) throw Object.assign(new Error("private body"), {status}); return (async function*(){yield "ok";})();};
  const run = async () => {const rows = []; for await(const row of reliableStream(open,{wait:async ms=>{delays.push(ms);}})) rows.push(row); return rows;};
  if ([400,401,403].includes(status)) {await assert.rejects(run()); assert.equal(attempts,1); assert.deepEqual(delays,[]);}
  else {assert.deepEqual(await run(),["ok"]); assert.equal(attempts,2); assert.deepEqual(delays,[400]);}
});
test("network reset retries; exhausted 502 stops after three attempts", async () => {
  let calls=0;
  const value=await reliableComplete(async()=>{if(++calls===1)throw Object.assign(new Error("reset"),{code:"ECONNRESET"});return "ok";},{wait:async()=>{}});
  assert.equal(value,"ok");assert.equal(calls,2); calls=0;
  const delays: number[]=[];
  await assert.rejects(reliableComplete(async()=>{calls++;throw Object.assign(new Error("secret"),{status:502});},{wait:async ms=>{delays.push(ms);}}));
  assert.equal(calls,3);assert.deepEqual(delays,[...retryDelays]);assert.equal(retryable(new Error("JSON invalid")),false);
});
test("failure before visible token retries; partial stream never restarts", async () => {
  let calls=0, visible=false;const output:string[]=[];
  const open=async()=> (async function*(){calls++;if(calls===1)throw Object.assign(new Error("upstream"),{status:502});yield "one";visible=true;yield "two";throw Object.assign(new Error("cut"),{status:503});})();
  await assert.rejects(async()=>{for await(const delta of reliableStream(open,{canRetry:()=>!visible,wait:async()=>{}}))output.push(delta);});
  assert.deepEqual(output,["one","two"]);assert.equal(calls,2);
});
test("startup/inactivity deadlines and user abort terminate pending upstream work", async () => {
  await assert.rejects(reliableComplete(()=>new Promise(()=>{}),{startMs:5,inactivityMs:5,totalMs:12,wait:async()=>{}}),{name:"TimeoutError"});
  let visible=false;
  const open=async()=> (async function*(){yield "one";visible=true;await new Promise(()=>{});yield "never";})();
  await assert.rejects(async()=>{for await(const delta of reliableStream(open,{startMs:10,inactivityMs:5,totalMs:40,canRetry:()=>!visible}))assert.equal(delta,"one");},{name:"TimeoutError"});
  const abort=new AbortController();abort.abort();
  await assert.rejects(reliableComplete(async signal=>{signal.throwIfAborted();return "bad";},{signal:abort.signal}),{name:"AbortError"});
  assert.equal(timeoutConfig().startMs,15000);
});
test("incremental JSON decodes Chinese, escaped quotes, newlines and Unicode across boundaries", () => {
  const answer='中文 **粗体**\n- 列表\n```python\nprint("好")\n``` 😀';
  const raw=JSON.stringify({usedSourceIds:["not-answer"],answer,nested:{answer:"ignored"}});
  const lexer=new JsonAnswerStream();let output="";
  for(const char of raw)output+=lexer.push(char);
  assert.equal(output,answer);assert.equal(lexer.answer,answer);assert.equal(lexer.raw,raw);
  const unicode=new JsonAnswerStream();assert.equal(unicode.push('{"answer":"\\u4'),"");assert.equal(unicode.push('e2d\\n\\"x\\""}'),'中\n"x"');
  assert.throws(()=>new JsonAnswerStream().push('{"answer":"one","answer":"dup"'),/Duplicate/);
});
test("NDJSON handles split UTF-8, multiple/empty deltas, Sources and done; rejects truncated stream", async () => {
  const frames:ChatFrame[]=[{type:"meta",requestId:"r"},{type:"answer_delta",delta:""},{type:"answer_delta",delta:"中"},{type:"answer_delta",delta:"文"},{type:"sources",answer:"中文",sources:[]},{type:"done",success:true}];
  const bytes=new TextEncoder().encode(frames.map(f=>JSON.stringify(f)+'\n').join(''));
  const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}),{headers:{"content-type":"application/x-ndjson"}});
  const seen:ChatFrame[]=[];await consumeChatStream(response,f=>seen.push(f));assert.deepEqual(seen,frames);
  await assert.rejects(consumeChatStream(new Response('{"type":"answer_delta","delta":"partial"}\n',{headers:{"content-type":"application/x-ndjson"}}),()=>{}),/中断/);
});
test("real loopback HTTP failure injection: 502 recovery, exhaustion, partial preservation, sanitized errors", async () => {
  const cases=["recovery","exhausted","partial"];
  const attempts:Record<string,number>={};
  const server=createServer(async(req,res)=>{
    const name=req.url!.slice(1);let emitted=false;
    const timing=new RequestTiming();
    const produce=async function*(signal:AbortSignal){
      const open=async()=> (async function*(){
        attempts[name]=(attempts[name]??0)+1;timing.deepSeekAttempts=attempts[name];
        if(name==='exhausted'||name==='recovery'&&attempts[name]===1)throw Object.assign(new Error("SECRET STACK PRIVATE KNOWLEDGE"),{status:502});
        yield "第一段";await new Promise(resolve=>setTimeout(resolve,20));yield "第二段";
        if(name==='partial')throw Object.assign(new Error("SECRET API KEY"),{status:503});
      })();
      for await(const delta of reliableStream(open,{signal,canRetry:()=>!emitted,wait:async()=>{}})){emitted=true;yield {type:"answer_delta" as const,delta};}
      yield {type:"result" as const,response:{answer:"第一段第二段",sources:[{id:"c",source:"projects.md",section:"Architecture",excerpt:"public"}]}};
    };
    const response=chatStreamResponse(produce,timing);res.writeHead(response.status,Object.fromEntries(response.headers));
    const reader=response.body!.getReader();
    while(true){const next=await reader.read();if(next.done)break;res.write(next.value);}reader.releaseLock();res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const port=(server.address() as {port:number}).port;
    for(const name of cases){
      const response=await fetch(`http://127.0.0.1:${port}/${name}`);assert.equal(response.status,200);
      const frames:ChatFrame[]=[];await consumeChatStream(response,f=>frames.push(f));
      const deltas=frames.filter(f=>f.type==='answer_delta');
      assert.ok(!JSON.stringify(frames).includes('SECRET'));
      assert.equal(frames.at(-1)?.type,'done');
      if(name==='recovery'){assert.equal(attempts[name],2);assert.equal(deltas.length,2);assert.ok(frames.some(f=>f.type==='sources'));assert.deepEqual(frames.at(-1),{type:'done',success:true});}
      else {assert.equal(attempts[name],name==='partial'?1:3);assert.equal(deltas.length,name==='partial'?2:0);assert.ok(frames.some(f=>f.type==='error'));assert.ok(!frames.some(f=>f.type==='sources'));assert.deepEqual(frames.at(-1),{type:'done',success:false});}
    }
  }finally{server.close();server.closeAllConnections();await once(server,'close');}
});

test("stream Agent: real SDK deltas, multi-turn rewrite and final citation validation", async () => {
  const cleanup=await syntheticKnowledgeFixture();
  const originalFetch = globalThis.fetch;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "offline-placeholder";
  let mode = "valid", sourceId = "", seenQuery = "", rewrites = 0, streamAttempts = 0;
  const stream = createStreamAnswer(async (query, _topK, index) => {
    seenQuery = query;
    const chunk = index!.chunks[0];
    sourceId = chunk.id;
    return [{id: chunk.id, content: chunk.content, metadata: chunk.metadata, score: 1}];
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init?.body));
    if (!body.stream) {
      rewrites++;
      assert.equal(JSON.parse(body.messages[1].content).history.length, 2);
      return Response.json({choices: [{message: {content: "代表项目的技术难点"}}]});
    }
    assert.equal(body.stream, true);
    assert.equal(body.max_tokens, 2400, "multi-turn streaming completion budget retains citation headroom");
    streamAttempts++;
    const raw = mode === "invisible" && streamAttempts === 1 ? JSON.stringify({unsupported: true}) : JSON.stringify({answer: mode === "short" || mode === "short-recovery" && streamAttempts === 1 ? "知道了" : "中文 **粗体**\n- 列表\n```python\nprint('好')\n```", usedSourceIds: [mode === "invalid" ? "not-allowed" : sourceId]});
    const frames: {choices: {delta: {content: string}; finish_reason: string | null}[]}[] = [...raw].map(content => ({choices: [{delta: {content}, finish_reason: null}]}));
    frames.push({choices: [{delta: {content: ""}, finish_reason: mode === "length" ? "length" : "stop"}]});
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", {headers: {"content-type": "text/event-stream"}});
  };
  try {
    const events = [];
    for await (const event of stream("这个项目里最难的地方是什么？", [{role: "user", content: "介绍代表项目"}, {role: "assistant", content: "项目介绍"}], new RequestTiming())) events.push(event);
    assert.equal(rewrites, 1);
    assert.equal(seenQuery, "代表项目的技术难点");
    assert.ok(events.filter(event => event.type === "answer_delta").length > 10);
    const last = events.at(-1)!;
    assert.equal(last.type, "result");
    if (last.type === "result") assert.equal(last.response.sources[0].id, sourceId);
    mode = "invisible"; streamAttempts = 0;
    const recovered = [];
    const recoveryTiming = new RequestTiming();
    for await (const event of stream("项目", [], recoveryTiming)) recovered.push(event);
    assert.equal(streamAttempts, 2, "invalid envelope before visible content uses bounded retry");
    assert.equal(recoveryTiming.deepSeekAttempts, 2);
    assert.equal(recovered.at(-1)?.type, "result");
    mode = "short-recovery"; streamAttempts = 0;
    const shortRecovery = [];
    for await (const event of stream("项目", [], new RequestTiming())) shortRecovery.push(event);
    assert.equal(streamAttempts, 2);
    assert.ok(!shortRecovery.some(e => e.type === "answer_delta" && e.delta === "知道了"));
    mode = "short"; streamAttempts = 0;
    let shortEvents = 0;
    await assert.rejects(async () => {for await (const event of stream("项目", [], new RequestTiming())) {void event; shortEvents++;}}, /不完整/);
    assert.equal(shortEvents, 0); assert.equal(streamAttempts, 3);
    for (mode of ["invalid", "length"]) {
      streamAttempts = 0;
      let resultCount = 0, deltas = 0;
      await assert.rejects(async () => {for await (const event of stream("项目", [], new RequestTiming())) {if (event.type === "result") resultCount++; else deltas++;}});
      assert.equal(resultCount, 0);
      assert.ok(deltas > 0);
      assert.equal(streamAttempts, 1, "visible partial output is never replayed");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = savedKey;
    await cleanup();
  }
});
