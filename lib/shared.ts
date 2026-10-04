export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_LENGTH = 10;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}
export interface Source {
  id: string;
  source: string;
  section: string;
  excerpt: string;
}
export interface ChatResponse {
  answer: string;
  sources: Source[];
}
export interface ChatMessage extends HistoryMessage {
  id: string;
  sources?: Source[];
  state?: "streaming" | "success" | "error" | "stopped";
}
export type ChatFrame =
  | {type: "meta"; requestId: string}
  | {type: "answer_delta"; delta: string}
  | {type: "sources"; answer: string; sources: Source[]}
  | {type: "error"; message: string; partial: boolean; requestId: string}
  | {type: "timing"; timing: {requestId: string; deepSeekAttempts: number; retryCount: number; requestTTFTMs: number | null; deepSeekTTFTMs: number | null; generationMs: number | null; requestTotalMs: number}}
  | {type: "done"; success: boolean};
