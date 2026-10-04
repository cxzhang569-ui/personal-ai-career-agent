import {createRequire} from "node:module";
import {cpSync, existsSync, mkdirSync, readFileSync} from "node:fs";
import path from "node:path";

// Next's Linux tracing may follow the browser export and omit the Node/native
// dependency closure. Copy only the installed runtime packages, never secrets.
const target = path.resolve(".next/standalone/node_modules");
const copied = new Map();
function packageFile(name, resolver) {
  try { return resolver.resolve(`${name}/package.json`); }
  catch {
    let directory = path.dirname(resolver.resolve(name));
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, "package.json");
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, "utf8")).name === name) return candidate;
      directory = path.dirname(directory);
    }
    throw new Error("Runtime package manifest missing");
  }
}
function copyPackage(name, resolver, modulesDirectory = target) {
  const manifestPath = packageFile(name, resolver);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const destination = path.join(modulesDirectory, name);
  if (copied.has(destination)) {
    if (copied.get(destination) !== manifest.version) throw new Error("Runtime package version conflict");
    return;
  }
  copied.set(destination, manifest.version);
  const directory = path.dirname(manifestPath);
  mkdirSync(path.dirname(destination), {recursive: true});
  cpSync(directory, destination, {recursive: true, dereference: true});
  const localRequire = createRequire(manifestPath);
  const optional = manifest.optionalDependencies || {};
  for (const dependency of Object.keys(manifest.dependencies || {})) {
    if (!(dependency in optional)) copyPackage(dependency, localRequire, path.join(destination, "node_modules"));
  }
  for (const dependency of Object.keys(optional)) {
    let available = false;
    try { packageFile(dependency, localRequire); available = true; } catch { /* Platform-specific optional dependency absent. */ }
    if (available) copyPackage(dependency, localRequire, path.join(destination, "node_modules"));
  }
}
const rootRequire = createRequire(path.resolve("package.json"));
const transformerManifest = packageFile("@huggingface/transformers", rootRequire);
copyPackage("@huggingface/transformers", rootRequire);
// The generated ESM Node bundle also imports this hoisted transitive package.
copyPackage("onnxruntime-common", createRequire(transformerManifest), path.join(target, "@huggingface/transformers/node_modules"));
// Preserve the pnpm location referenced by Next's external import as well.
const tracedDirectory = path.join(target, path.relative(path.resolve("node_modules"), path.dirname(transformerManifest)));
if (tracedDirectory !== path.join(target, "@huggingface/transformers")) {
  cpSync(path.join(target, "@huggingface/transformers"), tracedDirectory, {recursive: true, dereference: true});
}
createRequire(path.join(target, "@huggingface/transformers/package.json"))("onnxruntime-node");
console.log(JSON.stringify({nativeRuntimePackages: copied.size, nativeLoad: true}));
