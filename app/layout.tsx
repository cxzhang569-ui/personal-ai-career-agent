import type { Metadata } from "next";
import { profile } from "@/config/profile";
import "./globals.css";

export const metadata: Metadata = {
  title: `${profile.name} · AI 求职 Agent`,
  description: `通过对话了解${profile.name}的项目、经历与技术能力。回答基于个人知识库，并提供来源。`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
