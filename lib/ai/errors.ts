export class AgentError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
