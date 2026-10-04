import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: { "/*": ["./models/bge-small-zh-v1.5/**/*"], "/api/chat": ["./data/embeddings.json", "./knowledge/example/**/*.md"] },
  outputFileTracingExcludes: {"/*": ["./.cache/**/*", "./eval/**/*", "./tests/**/*", "./.env*", "./scripts/**/*"]},
  poweredByHeader: false,
};
export default config;
