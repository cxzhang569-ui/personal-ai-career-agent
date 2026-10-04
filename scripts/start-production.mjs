import {cp, mkdir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import nextEnv from "@next/env";

// Match Next's server-only environment loading; never print secret values.
nextEnv.loadEnvConfig(process.cwd(), false);
const args = process.argv.slice(2);
const option = name => {const i=args.indexOf(name); return i < 0 ? undefined : args[i+1];};
process.env.PORT = option("--port") || process.env.PORT || "3000";
process.env.HOSTNAME = option("--hostname") || "127.0.0.1";
const standalone = path.resolve(".next/standalone");
await mkdir(path.join(standalone,".next"), {recursive:true});
await cp(".next/static", path.join(standalone,".next/static"), {recursive:true});
await cp("public", path.join(standalone,"public"), {recursive:true});
await import(pathToFileURL(path.join(standalone,"server.js")).href);
