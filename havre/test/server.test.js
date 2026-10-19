import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Real process over stdio: the same handshake an MCP host does.
test("handshake, tool list and havre_ping over stdio", async () => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../src/index.js", import.meta.url))] }));
  try {
    assert.equal(client.getServerVersion().name, "havre");
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name), ["havre_ping"]);
    assert.equal((await client.callTool({ name: "havre_ping", arguments: {} })).content[0].text, "pong");
    assert.equal((await client.callTool({ name: "havre_ping", arguments: { message: "hi" } })).content[0].text, "hi");
    const bad = await client.callTool({ name: "havre_ping", arguments: { message: 5 } });
    assert.equal(bad.isError, true, "bad input is refused");
  } finally {
    await client.close();
  }
});
