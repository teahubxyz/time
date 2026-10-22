// Run the Worker locally: `npm start` in quc/, then http://localhost:8787/
import { createServer } from "node:http";
import worker from "./src/worker.js";

createServer(async (q, s) => {
  const r = await worker.fetch(new Request(`http://${q.headers.host}${q.url}`, { method: q.method }), { REV: "dev" });
  s.writeHead(r.status, Object.fromEntries(r.headers));
  s.end(Buffer.from(await r.arrayBuffer()));
}).listen(process.env.PORT || 8787);
