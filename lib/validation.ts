import { MAX_HISTORY_LENGTH, MAX_MESSAGE_LENGTH, type HistoryMessage } from "./shared";

export class InputError extends Error {}
export function validateChatInput(value: unknown): { message: string; history: HistoryMessage[] } {
  if (!value || typeof value !== "object") throw new InputError("请求格式不正确。");
  const input = value as Record<string, unknown>;
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > MAX_MESSAGE_LENGTH) throw new InputError(`请输入 1–${MAX_MESSAGE_LENGTH} 个字符的问题。`);
  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY_LENGTH) throw new InputError("对话历史过长，请开始新对话。");
  const parsed = history.map((item: unknown): HistoryMessage => {
    if (!item || typeof item !== "object") throw new InputError("对话历史格式不正确。");
    const entry = item as Record<string, unknown>;
    if ((entry.role !== "user" && entry.role !== "assistant") || typeof entry.content !== "string" || !entry.content.trim() || entry.content.length > 6000) throw new InputError("对话历史格式不正确。");
    return { role: entry.role, content: entry.content };
  });
  return { message: input.message.trim(), history: parsed };
}
