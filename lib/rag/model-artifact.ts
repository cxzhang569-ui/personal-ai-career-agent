import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import path from "node:path";
import manifest from "../../models/bge-small-zh-v1.5/manifest.json";

export {manifest};
export const modelDirectory = path.join(process.cwd(), "models", "bge-small-zh-v1.5");
export async function verifyModelArtifact(directory = modelDirectory, hash = true) {
  for (const file of manifest.files) {
    try {
      const location = path.join(directory, file.path);
      const details = await stat(location);
      if (!details.isFile() || details.size !== file.bytes) throw new Error();
      if (hash) {
        const digest = createHash("sha256");
        for await (const bytes of createReadStream(location)) digest.update(bytes);
        if (digest.digest("hex") !== file.sha256) throw new Error();
      }
    } catch {throw new Error("Embedding model artifact missing or invalid; run model:prepare and model:verify.");}
  }
  return {files: manifest.files.length, bytes: manifest.files.reduce((n, f) => n + f.bytes, 0), revision: manifest.revision};
}
