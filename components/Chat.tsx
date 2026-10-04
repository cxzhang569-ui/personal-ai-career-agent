"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { profile } from "@/config/profile";
import { MAX_HISTORY_LENGTH, type ChatMessage, type HistoryMessage } from "@/lib/shared";
import { consumeChatStream } from "@/lib/chat-stream";
import {safeAbortReason, safeStreamError} from "@/lib/stream-diagnostics";
import { ChatInput } from "./ChatInput";
import { Message } from "./Message";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { Icon } from "./Icon";

function ProfileLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  if (!href) return <span className="nav-link unconfigured" title={`${label} 链接尚未填写`}><Icon name={icon} />{label}<span className="link-pending">待添加</span></span>;
  return <a className="nav-link" href={href} target="_blank" rel="noopener noreferrer"><Icon name={icon} />{label}<Icon name="arrow" /></a>;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "streaming" | "success" | "error">("idle");
  const loading = phase === "loading" || phase === "streaming";
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const retryRequest = useRef<{question: string; history: HistoryMessage[]; assistantId: string} | null>(null);
  const lastScroll = useRef(0);
  const follow = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const onScroll = () => {follow.current = document.documentElement.scrollHeight - window.innerHeight - window.scrollY < 240;};
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => {mounted.current = false; controller.current?.abort("component_unmount"); window.removeEventListener("scroll", onScroll);};
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {if (follow.current && (messages.length || loading || error)) {end.current?.scrollIntoView({behavior: "auto", block: "end"}); lastScroll.current = Date.now();}}, Math.max(0, 200 - (Date.now() - lastScroll.current)));
    return () => clearTimeout(timer);
  }, [messages, loading, error]);

  async function send(question: string, retry = false) {
    if (busy.current) return;
    busy.current = true; setPhase("loading"); setError(""); follow.current = true;
    const previous = retryRequest.current;
    const history = retry && previous ? previous.history : messages.filter(m => m.state !== "error" && m.state !== "stopped").slice(-MAX_HISTORY_LENGTH).map(({role, content}) => ({role, content}));
    const assistantId = crypto.randomUUID();
    retryRequest.current = {question, history, assistantId};
    setMessages(items => retry && previous ? items.filter(m => m.id !== previous.assistantId) : [...items, {id: crypto.randomUUID(), role: "user", content: question}]);
    const abort = new AbortController(); controller.current = abort;
    let requestId = assistantId;
    const startedAt = performance.now();
    const trace = (stage: string, fields: Record<string, string | number | boolean | null> = {}) => {
      if (process.env.NODE_ENV !== "production") console.info("chat_client_trace", JSON.stringify({requestId, clientRequestId: assistantId, timestamp: new Date().toISOString(), elapsedMs: performance.now() - startedAt, stage, ...fields}));
    };
    abort.signal.addEventListener("abort", () => trace("abort_signal_triggered", {abortReason: safeAbortReason(abort.signal.reason)}), {once: true});
    let answerStarted = false, streamError = false;
    const update = (content: string, append: boolean, sources?: ChatMessage["sources"], state: ChatMessage["state"] = "streaming") => {
      if (!mounted.current) return;
      setMessages(items => {
        const exists = items.some(m => m.id === assistantId);
        return exists ? items.map(m => m.id === assistantId ? {...m, content: append ? m.content + content : content, sources, state} : m) : [...items, {id: assistantId, role: "assistant", content, sources, state}];
      });
    };
    try {
      trace("fetch_started", {messageCount: history.length + 1, historyChars: history.reduce((n, m) => n + m.content.length, 0), currentQuestionChars: question.length, retry});
      const response = await fetch("/api/chat", {method: "POST", headers: {"Content-Type": "application/json", "Accept": "application/x-ndjson"}, body: JSON.stringify({message: question, history}), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)])});
      requestId = response.headers.get("x-request-id") ?? requestId;
      trace("response_received", {httpStatus: response.status});
      if (!response.ok) throw new Error("Chat unavailable");
      await consumeChatStream(response, frame => {
        if (!mounted.current) return;
        if (frame.type === "answer_delta" && frame.delta) {answerStarted = true; setPhase("streaming"); update(frame.delta, true);}
        else if (frame.type === "sources") update(frame.answer, false, frame.sources, "success");
        else if (frame.type === "error") {streamError = true; setPhase("error"); setError(frame.partial ? "回答生成中断，请重试。" : "刚才回答生成失败了，请再试一次。");}
        else if (frame.type === "done") {if (!frame.success) streamError = true; if (!streamError) setPhase("success");}
      }, trace);
      if (streamError) throw new Error("Stream failed");
    } catch (caught) {
      trace("fetch_error", {...safeStreamError(caught), aborted: abort.signal.aborted});
      if (mounted.current) {
        if (abort.signal.aborted && abort.signal.reason === "user_stop") {
          setPhase("idle"); setError("");
          setMessages(items => items.map(m => m.id === assistantId ? {...m, state: "stopped", sources: undefined} : m));
          trace("request_stopped");
          return;
        }
        setPhase("error"); setError(answerStarted ? "回答生成中断，请重试。" : "刚才回答生成失败了，请再试一次。");
        setMessages(items => items.map(m => m.id === assistantId ? {...m, state: "error", sources: undefined} : m));
      }
    } finally {busy.current = false; if (controller.current === abort) controller.current = null;}
  }

  return <div className="site-shell">
    <header className="site-header"><Link className="brand" href="/" aria-label="首页"><span className="brand-symbol"><Icon name="spark" /></span><span>{profile.name}<span className="brand-divider">/</span><span className="brand-caption">AI Agent</span></span></Link><nav aria-label="个人链接"><ProfileLink href={profile.resume} label="Resume" icon="file" /><ProfileLink href={profile.github} label="GitHub" icon="github" /></nav></header>
    <main className={messages.length ? "chat-main has-messages" : "chat-main"} data-chat-state={phase}>
      {!messages.length ? <section className="welcome"><div className="eyebrow"><span className="status-dot" />PERSONAL CAREER AGENT</div><div className="hero-symbol"><Icon name="spark" /></div><h1>Hi，我是{profile.name}的<br /><span>AI 求职 Agent。</span></h1><p className="intro">从一个问题开始，认识一个真实的候选人。<br />聊聊他的项目、技术能力，以及一路走来的学习经历。</p><div className="welcome-divider" /><p className="suggestions-label">你可以从这里开始 <span>↘</span></p><SuggestedQuestions onSend={(q) => void send(q)} disabled={loading} /><div className="evidence-note"><Icon name="check" /><span>基于个人知识库回答<span className="note-separator">·</span>提供来源依据<span className="note-separator">·</span>信息不足时如实说明</span></div></section> : <section className="conversation"><div className="conversation-heading"><span><span className="status-dot" />与你对话 · {profile.agentName}</span><button onClick={() => {controller.current?.abort(); setMessages([]); setError(""); setPhase("idle"); retryRequest.current = null;}} disabled={loading}><Icon name="reset" />新对话</button></div><div role="log" aria-label="聊天记录">{messages.map((message) => <Message key={message.id} message={message} />)}</div>{phase === "loading" && <div className="loading-message" role="status"><div className="message-avatar"><Icon name="spark" /></div><span>正在查阅知识库<span className="loading-dots">…</span></span></div>}{loading && <button className="nav-link" onClick={() => controller.current?.abort("user_stop")}>停止回答</button>}{error && <div className="error-message" role="alert"><p>{error}</p><button disabled={loading} onClick={() => {const previous = retryRequest.current; if (previous) void send(previous.question, true);}}>重试这个问题 <Icon name="reset" /></button></div>}</section>}
      <div ref={end} className="scroll-anchor" />
    </main>
    <footer className="composer-dock"><div className="composer-wrap"><ChatInput onSend={(q) => void send(q)} loading={loading} /><p className="footer-note">回答仅依据已记录的个人资料，重要信息请结合简历核实。<span>POWERED BY KNOWLEDGE, NOT GUESSWORK</span></p></div></footer>
  </div>;
}
