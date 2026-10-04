import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([...nextVitals, ...nextTypescript, globalIgnores([".next/**", ".cache/**", "eval/private/**", "scripts/*", "!scripts/ingest.ts", "!scripts/prepare-model.ts", "!scripts/prepare-native-runtime.mjs", "!scripts/start-production.mjs", "!scripts/evaluate-public.ts", "!scripts/oss-release.mjs", "!scripts/check-example.ts", "next-env.d.ts"])]);
