"use client";
import { useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/shared";
import { profile } from "@/config/profile";
import { Icon } from "./Icon";

export function ChatInput({ onSend, loading }: { onSend: (message: string) => void; loading: boolean }) {
  const [value, setValue] = useState("");
  const composing = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  function send() {
    if (!value.trim() || loading) return;
    onSend(value.trim()); setValue("");
    if (input.current) input.current.style.height = "auto";
  }
  return <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
    <label htmlFor="message" className="sr-only">你的问题</label>
    <textarea id="message" ref={input} value={value} maxLength={MAX_MESSAGE_LENGTH} rows={1} placeholder={`问一个关于${profile.name}的问题…`} onChange={(event) => {
      setValue(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
    }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); }
    }} />
    <div className="composer-bottom"><span>Enter 发送 <span className="key-hint">· Shift + Enter 换行</span>{value.length > 1800 ? ` · ${value.length}/${MAX_MESSAGE_LENGTH}` : ""}</span><button type="submit" className="send-button" disabled={loading || !value.trim()} aria-label={loading ? "正在回答" : "发送问题"}><Icon name="send" /></button></div>
  </form>;
}
