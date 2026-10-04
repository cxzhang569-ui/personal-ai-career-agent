import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { KnowledgeChunk } from "./types";

const types: Record<string, string> = { profile: "profile", education: "education", skills: "skill", projects: "project", experience: "experience", career: "career" };

export function chunkMarkdown(markdown: string, source: string, maxLength = 1200): KnowledgeChunk[] {
  if (/<!--\s*draft\s*-->/i.test(markdown)) return [];
  const clean = markdown.replace(/<!--[\s\S]*?-->/g, "").trim();
  const chunks: KnowledgeChunk[] = [];
  let section = source.replace(/\.md$/i, "");
  const headings: string[] = [];
  let lines: string[] = [];
  function flush() {
    const content = lines.filter((line) => !/^\s*(?:[-*]\s*)?[\p{L}\p{N}\s/（）()_-]+[:：]\s*$/u.test(line)).join("\n").trim();
    lines = [];
    if (!content) return;
    // Bound every chunk, including long paragraphs without line breaks.
    for (let start = 0; start < content.length; start += maxLength) {
      const body = content.slice(start, start + maxLength);
      const text = `${section}\n${body}`;
      chunks.push({ id: createHash("sha256").update(`${source}:${chunks.length}:${text}`).digest("hex").slice(0, 16), content: text, metadata: { source, section, type: types[source.replace(/\.md$/i, "")] ?? "other" } });
    }
  }
  for (const line of clean.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = heading[2].trim();
      section = (level === 1 ? [headings[0]] : headings.slice(1)).filter(Boolean).join(" / ");
    }
    else lines.push(line);
  }
  flush();
  return chunks;
}

export async function readKnowledge(directory = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.KNOWLEDGE_DIR || "knowledge/example")) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".md")).sort();
  const hash = createHash("sha256");
  const chunks: KnowledgeChunk[] = [];
  for (const file of files) {
    const markdown = await readFile(path.join(directory, file), "utf8");
    hash.update(JSON.stringify([file, markdown]));
    chunks.push(...chunkMarkdown(markdown, file));
  }
  return { fingerprint: hash.digest("hex"), chunks };
}
