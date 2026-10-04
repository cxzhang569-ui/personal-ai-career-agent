import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { AgentError } from "../ai/errors";
import {modelDirectory, verifyModelArtifact} from "./model-artifact";

const model = "BAAI/bge-small-zh-v1.5";
// ONNX export of the same BAAI model, pinned so documents and queries stay compatible.
const onnxModel = "onnx-community/bge-small-zh-v1.5-ONNX";
const revision = "9507db33464b5da99a532ac26b2a251767cbc62b";
export const embeddingDimensions = 512;
export const embeddingModel = () => model;
// Retain the existing index compatibility interface; this is a local provider ID, not a URL.
export const embeddingBaseURL = () => `local:${onnxModel}@${revision}:cpu:fp32:cls:l2:lowercase:max512`;

// Shared across Next instrumentation and route bundles in this Node process.
const modelState = globalThis as typeof globalThis & {__careerBgeExtractor?: Promise<FeatureExtractionPipeline>};

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!modelState.__careerBgeExtractor) {
    modelState.__careerBgeExtractor = (async () => {
      if (typeof window !== "undefined") throw new Error("Embedding inference must run on the server.");
      await verifyModelArtifact();
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      // Load the pinned local directory so v4 file discovery never probes main.
      const extractor = await pipeline("feature-extraction", modelDirectory, {
        local_files_only: true, device: "cpu", dtype: "fp32",
      });
      if (extractor.tokenizer.model_max_length !== 512) throw new Error("Unexpected BGE tokenizer length.");
      return extractor;
    })().catch(() => {
      modelState.__careerBgeExtractor = undefined;
      throw new AgentError("本地 BGE 模型部署文件缺失或加载失败，请检查模型部署产物及 CPU 运行环境。");
    });
  }
  return modelState.__careerBgeExtractor;
}

export async function warmEmbeddingModel() {await embedText("模型启动检查");}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new AgentError("本地 BGE 未返回有效向量。");
  return vector;
}

export async function embedTexts(input: string[]): Promise<number[][]> {
  if (!input.length) return [];
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  // Small CPU batches bound memory. Both document and query paths use CLS + L2,
  // without a query-only instruction, matching HuggingFaceEmbeddings.encode().
  for (let start = 0; start < input.length; start += 8) {
    // BAAI sentence_bert_config.json sets do_lower_case=true. SentenceTransformer
    // strips and lowercases before tokenization, independently of tokenizer config.
    const texts = input.slice(start, start + 8).map(text => text.trim().toLowerCase());
    const output = await extractor(texts, {
      pooling: "cls", normalize: true,
    });
    const batch = output.tolist() as number[][];
    if (batch.length !== Math.min(8, input.length - start) || batch.some((vector) =>
      vector.length !== embeddingDimensions || !vector.every(Number.isFinite) ||
      Math.abs(Math.hypot(...vector) - 1) > 0.0001)) {
      throw new AgentError("本地 BGE 返回了无效向量，请检查模型文件。");
    }
    vectors.push(...batch);
  }
  return vectors;
}
