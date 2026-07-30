import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = requiredEnv("FOUNDRY_REST_API_BASE_URL").replace(/\/$/, "");
const apiKey = requiredEnv("FOUNDRY_REST_API_KEY");
const defaultClientId = process.env.FOUNDRY_CLIENT_ID || undefined;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function get(path: string, params: Record<string, string | boolean | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const response = await fetch(`${baseUrl}${path}?${query}`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Foundry REST API ${response.status}: ${body}`);
  return body;
}

function textResult(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const server = new McpServer({ name: "foundry-rest-api-mcp", version: "0.1.0" });

server.tool("foundry_list_clients", "List Foundry VTT worlds connected to the relay.", {}, async () =>
  textResult(await get("/clients", {})),
);

server.tool(
  "foundry_get_structure",
  "Read folders and document references from a Foundry world. This is read-only.",
  {
    clientId: z.string().optional().describe("Foundry client ID; defaults to FOUNDRY_CLIENT_ID."),
    types: z.string().optional().describe("Comma-separated types, e.g. Actor,Scene,JournalEntry."),
    path: z.string().optional().describe("Optional folder path to read from."),
    recursive: z.boolean().optional().describe("Whether to traverse nested folders."),
    includeEntityData: z.boolean().optional().describe("Include full entity data instead of references."),
  },
  async ({ clientId, types, path, recursive, includeEntityData }) =>
    textResult(await get("/structure", { clientId: clientId ?? defaultClientId, types, path, recursive, includeEntityData })),
);

server.tool(
  "foundry_get_entity",
  "Get one Foundry document by UUID, such as Actor.abc123. This is read-only.",
  {
    uuid: z.string().min(1).describe("Foundry document UUID."),
    clientId: z.string().optional().describe("Foundry client ID; defaults to FOUNDRY_CLIENT_ID."),
    actor: z.boolean().optional().describe("For embedded documents, return the parent actor."),
  },
  async ({ uuid, clientId, actor }) =>
    textResult(await get("/get", { uuid, clientId: clientId ?? defaultClientId, actor })),
);

await server.connect(new StdioServerTransport());
