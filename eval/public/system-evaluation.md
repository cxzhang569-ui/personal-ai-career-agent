# Anonymous system evaluation

Offline tests cover stream parsing, retries, completion validation, cancellation, allowlisted sources and concurrency release. Real E2E tests revealed upstream instability and motivated bounded retry / streaming reliability work. Detailed conversations and failure traces remain private.

Prior Linux Docker validation exercised native ONNX inference, network-disabled retrieval and production-mode streaming. It was a local small-scale validation, not public deployment or long-duration production proof. Current open-source reproducibility is reported separately in ../open-source-release-audit.md.

Reranking is optional and off by default. The system still lacks reliable retrieval unknown rejection, distributed rate limits, public ingress verification and proven high-concurrency behavior.
