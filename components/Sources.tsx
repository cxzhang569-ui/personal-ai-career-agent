import type { Source } from "@/lib/shared";
import { Icon } from "./Icon";

export function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return <div className="sources"><p className="sources-label">回答依据 · {sources.length} 个来源</p><div className="source-list">{sources.map((source) => <details key={source.id} className="source">
    <summary><Icon name="file" /><span>{source.section} <small>· {source.source}</small></span></summary>
    <p className="source-excerpt">{source.excerpt}</p>
  </details>)}</div></div>;
}
