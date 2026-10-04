import {readdir, readFile, mkdir, writeFile, copyFile, lstat} from 'node:fs/promises';
import path from 'node:path';

// Explicit publication boundary; adding a new file requires reviewing this list.
const roots = ['.env.example','.gitignore','.dockerignore','Dockerfile','AGENTS.md','CLAUDE.md','README.md','LICENSE','CONTRIBUTING.md','SECURITY.md','OPEN_SOURCE_CHECKLIST.md','THIRD_PARTY_NOTICES.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','next-env.d.ts','next.config.ts','eslint.config.mjs','postcss.config.mjs','instrumentation.ts','data/.gitkeep','models/bge-small-zh-v1.5/manifest.json','knowledge/README.md'];
const directories = ['app','components','config','lib','tests','knowledge/example','eval/public','.github'];
const scripts = ['ingest.ts','prepare-model.ts','prepare-native-runtime.mjs','start-production.mjs','evaluate-public.ts','oss-release.mjs','check-example.ts'];
export async function publicationFiles(root = process.cwd()) {
  const files = [...roots, ...scripts.map(name=>'scripts/'+name)];
  async function walk(dir) {
    for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})) {
      const relative = dir+'/'+entry.name;
      if(entry.isSymbolicLink()) throw Error('Symlinks are not allowed in the release.');
      if(entry.isDirectory()) await walk(relative);
      else files.push(relative);
    }
  }
  for(const dir of directories) await walk(dir);
  for(const entry of await readdir(path.join(root,'eval'))) if(entry.endsWith('.ts')) files.push('eval/'+entry);
  // No unreviewed images/assets: only the empty public-directory marker is published.
  files.push('public/.gitkeep');
  for(const name of ['eval/open-source-release-audit.md','eval/open-source-release-audit.json']) {
    try {await lstat(path.join(root,name));files.push(name);} catch { /* First audit. */ }
  }
  return files.sort();
}

export function scanText(text) {
  const findings=[];
  text.split(/\r?\n/).forEach((line,index)=>{
    // High-confidence key formats only; values are never returned or logged.
    if(/\bsk-[A-Za-z0-9_-]{20,}\b/.test(line)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) findings.push({line:index+1,type:'credential'});
    if(/(?:[A-Z]:[\\/](?:Users|py)[\\/]|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/)/i.test(line)) findings.push({line:index+1,type:'local-identity-or-path'});
    if(/(?:api[_-]?key|secret|token)\s*[:=]\s*["'](?:[A-Za-z0-9_+/=-]{32,})["']/i.test(line)&&!/(?:placeholder|example|\.repeat\(|test-)/i.test(line)) findings.push({line:index+1,type:'suspected-hardcoded-secret'});
  });
  return findings;
}

async function main() {
  const files=await publicationFiles();
  const findings=[];
  for(const file of files) {
    const text=await readFile(file,'utf8');
    for(const finding of scanText(text)) findings.push({file,...finding});
  }
  // Never read .env.local; its exclusion follows from the publication allowlist.
  const result={fileCount:files.length,findings,envLocalRead:false,envLocalIncluded:files.includes('.env.local'),privateKnowledgeIncluded:files.some(f=>/^knowledge\/(?:local|private)\//.test(f)),generatedIndexIncluded:files.includes('data/embeddings.json'),modelWeightsIncluded:files.some(f=>/\.onnx$/.test(f))};
  await mkdir('.cache/oss',{recursive:true});
  await writeFile('.cache/oss/publication-manifest.json',JSON.stringify({files,...result},null,2)+'\n');
  console.log(JSON.stringify(result));
  if(findings.length) throw Error('Publication audit failed; inspect filenames and line numbers only.');
  if(process.argv.includes('--export')) {
    const destination=path.join(process.cwd(),'.cache','oss','release');
    try {await lstat(destination);throw Error('Export destination already exists; choose a fresh workspace snapshot.');}
    catch(error) {if(error.code!=='ENOENT')throw error;}
    for(const file of files) {const target=path.join(destination,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}
    console.log('Sanitized source exported to .cache/oss/release (no private data, secrets, models or dependencies).');
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve('scripts/oss-release.mjs')) main().catch(()=>{console.error('Release audit/export failed. No secret values were printed.');process.exitCode=1;});
