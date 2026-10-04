import {copyFile, mkdir, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {manifest, modelDirectory, verifyModelArtifact} from "../lib/rag/model-artifact";

async function main() {
  if (!process.argv.includes("--verify")) {
    for (const file of manifest.files) {
      const target = path.join(modelDirectory, file.path);
      await mkdir(path.dirname(target), {recursive: true});
      try {if ((await stat(target)).size === file.bytes) continue;} catch { /* Prepare only, never runtime. */ }
      const temporary = `${target}.tmp.${process.pid}`;
      try {
        const cache = path.join(process.cwd(), ".cache", "transformers", manifest.export, manifest.revision, file.path);
        try {await copyFile(cache, temporary);}
        catch {
          const response = await fetch(`https://huggingface.co/${manifest.export}/resolve/${manifest.revision}/${file.path}`, {signal: AbortSignal.timeout(600000)});
          if (!response.ok || !response.body) throw new Error("Pinned model download failed.");
          async function* chunks() {
            const reader = response.body!.getReader();
            try {while (true) {const {done, value} = await reader.read(); if (done) break; yield value;}}
            finally {reader.releaseLock();}
          }
          await writeFile(temporary, chunks());
        }
        await rename(temporary, target);
      } finally {await rm(temporary, {force: true});}
    }
  }
  console.log(JSON.stringify(await verifyModelArtifact()));
}
void main().catch(() => {console.error("Embedding artifact preparation/verification failed; no secret configuration was read."); process.exitCode = 1;});
