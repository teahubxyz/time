import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Stateless by construction: a fresh server per connection, handlers are pure functions of their input.
// Add tools here; nothing in this file may read or write disk, a database, or a stored secret.
export function createServer() {
  const server = new McpServer({ name: "havre", version: "0.0.0" });
  server.registerTool(
    "havre_ping",
    { description: "Placeholder tool: echoes a message back (default 'pong').", inputSchema: { message: z.string().max(200).optional() } },
    async ({ message }) => ({ content: [{ type: "text", text: message ?? "pong" }] }),
  );
  return server;
}
