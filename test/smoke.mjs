import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [command = process.execPath, ...args] = process.argv.slice(2);

const transport = new StdioClientTransport({
  command,
  args: args.length > 0 ? args : ["dist/index.js"],
  env: {
    ...process.env,
    FOUNDRY_REST_API_BASE_URL: "http://127.0.0.1:3011",
    FOUNDRY_REST_API_KEY: "smoke-test-key",
  },
});

const client = new Client({ name: "foundry-rest-api-mcp-smoke-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map(({ name }) => name).sort(),
    ["foundry_get_entity", "foundry_get_structure", "foundry_list_clients"],
  );
} finally {
  await client.close();
}
