import "server-only";
import OpenAI from "openai";
import { AgentError } from "./errors";
import { timeoutConfig } from "./reliability";

export function getDeepSeekClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new AgentError("Agent 尚未连接 DeepSeek，请站点维护者配置服务器 API Key。");
  return new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: key, timeout: timeoutConfig().startMs, maxRetries: 0 });
}
export const chatModel = () => process.env.DEEPSEEK_MODEL || "deepseek-flash";
