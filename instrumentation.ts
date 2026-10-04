export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const {warmEmbeddingModel} = await import("./lib/rag/embed");
    await warmEmbeddingModel();
    console.info("embedding_artifact_ready", JSON.stringify({device: "cpu", offline: true}));
  }
}
