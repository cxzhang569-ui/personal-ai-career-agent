import test from "node:test";
import assert from "node:assert/strict";
import {clientBucket, createChatSlots, createGlobalBudget} from "../lib/request-protection";
import {chatStreamResponse} from "../lib/ai/http-stream";
import {RequestTiming} from "../lib/request-timing";
import {consumeChatStream} from "../lib/chat-stream";
import {verifyModelArtifact} from "../lib/rag/model-artifact";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

test("untrusted forwarding cannot bypass shared limits; authenticated ingress requires one IP", () => {
  const token = "a".repeat(32);
  for (const ip of ["1.2.3.4", "8.8.8.8", "spoof, chain"]) assert.equal(clientBucket(new Headers({"x-forwarded-for":ip}), false), "unverified-client");
  assert.throws(() => clientBucket(new Headers({"x-forwarded-for":"1.2.3.4"}), true, token));
  assert.equal(clientBucket(new Headers({"x-forwarded-for":"1.2.3.4", "x-proxy-token":token}), true, token), "1.2.3.4");
  assert.throws(() => clientBucket(new Headers({"x-forwarded-for":"1.2.3.4, 5.6.7.8", "x-proxy-token":token}), true, token));
});
test("bounded concurrency and global request budget recover without double release", () => {
  const slots = createChatSlots();
  const a = slots.acquire(2)!, b = slots.acquire(2)!;
  assert.equal(slots.acquire(2), null); a(); a(); assert.equal(slots.count(), 1);
  const c = slots.acquire(2)!; b(); c(); assert.equal(slots.count(), 0);
  const budget = createGlobalBudget();
  assert.equal(budget(1000000, 2), true); assert.equal(budget(1000001, 2), true);
  assert.equal(budget(1000002, 2), false); assert.equal(budget(1600000, 2), true);
});
test("success/error/abort/cancel release streaming slot exactly once", async () => {
  for (const kind of ["success", "error", "abort", "cancel"]) {
    let releases = 0, settle!: () => void;
    const gate = new Promise<void>(r => {settle = r;});
    const abort = new AbortController();
    const response = chatStreamResponse(async function*(signal) {
      if (kind === "abort" || kind === "cancel") await gate;
      signal.throwIfAborted();
      if (kind === "error") throw new Error("private");
      yield {type:"result", response:{answer:"complete", sources:[]}};
    }, new RequestTiming(), abort.signal, () => {releases++;});
    if (kind === "cancel") {await response.body!.cancel(); assert.equal(releases, 1); settle();}
    else {if (kind === "abort") {abort.abort(); assert.equal(releases, 1); settle();} await consumeChatStream(response, () => {});}
    await new Promise(r => setTimeout(r, 0)); assert.equal(releases, 1);
  }
});
test("missing model artifact fails before any network request", async () => {
  await assert.rejects(verifyModelArtifact(".cache/deployment-p0/nonexistent-artifact"), /artifact missing or invalid/);
});
test("same-size corrupted artifact is rejected by hash", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bge-integrity-"));
  try {await writeFile(path.join(directory,"config.json"), Buffer.alloc(904)); await assert.rejects(verifyModelArtifact(directory), /artifact missing or invalid/);}
  finally {await rm(directory, {recursive:true, force:true});}
});
test("HTTP total timeout releases slot even before producer settles", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  let releases = 0, settle!:()=>void;
  const gate = new Promise<void>(resolve=>{settle=resolve;});
  const response = chatStreamResponse(async function*(signal) {await gate; signal.throwIfAborted(); yield {type:"result",response:{answer:"late",sources:[]}};}, new RequestTiming(), undefined, ()=>{releases++;});
  t.mock.timers.tick(55000); assert.equal(releases,1); settle();
  await consumeChatStream(response, ()=>{}); assert.equal(releases,1);
});
