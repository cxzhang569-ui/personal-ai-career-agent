export const profile = {
  name: "Alex Chen",
  agentName: "Career Agent",
  title: "Student / AI Developer",
  github: "",
  resume: "",
};

export const suggestedQuestions = [
  { label: "先认识一下", question: "介绍一下他，包括他的学习背景和求职方向。", icon: "person" },
  { label: "聊聊他的项目", question: "他做过哪些项目？请结合具体经历介绍。", icon: "project" },
  { label: "技术能力与证据", question: "他的 Python 能力怎么样？有哪些项目证据？", icon: "code" },
  { label: "AI 相关实践", question: "他做过哪些 AI、RAG 或 Agent 相关实践？", icon: "spark" },
] as const;
