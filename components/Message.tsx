import type { ChatMessage } from "@/lib/shared";
import { Sources } from "./Sources";
import { Icon } from "./Icon";
import { profile } from "@/config/profile";

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") return <article className="user-message" aria-label="你的问题"><p>{message.content}</p></article>;
  return <article className="assistant-message" aria-label="Agent 回答"><div className="message-avatar"><Icon name="spark" /></div><div className="message-body"><span className="message-author">{profile.agentName}{message.state === "streaming" && <span role="status"> · 正在生成…</span>}{message.state === "error" && <span> · 未完成</span>}{message.state === "stopped" && <span> · 已停止</span>}</span><p className="answer-text">{message.content}</p><Sources sources={message.sources ?? []} /></div></article>;
}
