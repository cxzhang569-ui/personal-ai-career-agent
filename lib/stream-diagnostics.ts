// Never retain provider messages/causes: they can contain request bodies or secrets.
export function safeStreamError(error: unknown) {
  const value = error as {name?: string; code?: string; status?: number; cause?: {code?: string}} | null;
  const names = ["AbortError", "TimeoutError", "APIError", "APIConnectionError", "APIConnectionTimeoutError", "SyntaxError", "TypeError", "AgentError", "Error"];
  const codes = ["ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET", "ABORT_ERR", "EPIPE", "ECONNREFUSED"];
  const code = codes.includes(value?.code ?? "") ? value?.code : codes.includes(value?.cause?.code ?? "") ? value?.cause?.code : null;
  return {errorName: names.includes(value?.name ?? "") ? value!.name! : "Error", errorMessage: "redacted; see diagnostic stage", errorCause: code ?? null, errorCode: code ?? null, httpStatus: typeof value?.status === "number" ? value.status : null};
}
export function safeAbortReason(reason: unknown) {
  const allowed = ["client_cancel", "component_unmount", "user_stop", "startup_timeout", "inactivity_timeout", "total_timeout", "retry_cleanup", "attempt_cleanup", "request_abort", "server_shutdown"];
  const text = typeof reason === "string" ? reason : (reason as {message?: string})?.message;
  return allowed.includes(text ?? "") ? text! : "request_abort";
}
