// Run the Worker locally: `npm start` in quc/, then http://localhost:8787/
// Without VENICE_API_KEY in the environment the agent gives canned offline answers; with it, it uses the real models.
import { createServer } from "node:http";
import worker from "./src/worker.js";
import { memoryStore } from "./src/runs.js";

const env = { REV: "dev", KV: memoryStore(), VENICE_API_KEY: process.env.VENICE_API_KEY || "" };

createServer(async (q, s) => {
  const chunks = [];
  for await (const c of q) chunks.push(c);
  const body = chunks.length && q.method !== "GET" && q.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request(`http://${q.headers.host}${q.url}`, { method: q.method, headers: q.headers, body }), env);
  s.writeHead(r.status, Object.fromEntries(r.headers));
  s.end(Buffer.from(await r.arrayBuffer()));
}).listen(process.env.PORT || 8787, () => console.log(`quc on http://localhost:${process.env.PORT || 8787}/`));
