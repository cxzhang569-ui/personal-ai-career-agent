export interface ChunkMetadata {
  source: string;
  section: string;
  type: string;
}
export interface KnowledgeChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}
export interface EmbeddedChunk extends KnowledgeChunk { embedding: number[] }
export interface SearchResult extends KnowledgeChunk { score: number }
export interface KnowledgeIndex {
  version: 1;
  model: string;
  provider: string;
  fingerprint: string;
  generatedAt: string;
  chunks: EmbeddedChunk[];
}
