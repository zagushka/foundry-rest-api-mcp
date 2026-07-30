#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = requiredEnv("FOUNDRY_REST_API_BASE_URL").replace(/\/$/, "");
const apiKey = requiredEnv("FOUNDRY_REST_API_KEY");
const defaultClientId = process.env.FOUNDRY_CLIENT_ID || undefined;

type Args = Record<string, unknown>;
type Method = "GET" | "POST" | "PUT" | "DELETE";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function omitUndefined(value: Args): Args {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function request(method: Method, path: string, query: Args = {}, body: Args = {}) {
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) queryString.set(key, String(value));
  }

  const response = await fetch(`${baseUrl}${path}${queryString.size ? `?${queryString}` : ""}`, {
    method,
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
      ...(Object.keys(body).length ? { "content-type": "application/json" } : {}),
    },
    ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`Foundry REST API ${response.status}: ${responseBody}`);
  return responseBody;
}

function textResult(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const server = new McpServer({ name: "foundry-rest-api-mcp", version: "0.3.0" });

const scope = {
  clientId: z.string().optional().describe("Foundry client ID; defaults to FOUNDRY_CLIENT_ID."),
  userId: z.string().optional().describe("Optional Foundry user ID or username for permission-scoped access."),
};
const json = z.record(z.unknown()).describe("JSON object accepted by Foundry.");
const canvasData = z.union([json, z.array(json)]).describe("One canvas document or an array of documents.");
const actorEmbeddedDocumentType = z.enum(["Item", "ActiveEffect"]);
const actorEmbeddedDocument = json.refine(
  (document) => typeof document._id === "string" || typeof document.id === "string",
  "Each document must include its Foundry _id or id.",
);
const annotations = {
  read: { readOnlyHint: true },
  write: { readOnlyHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true },
} as const;

/** Register one explicit MCP tool while routing query and JSON body consistently. */
function tool(
  name: string,
  description: string,
  schema: z.ZodRawShape,
  method: Method,
  path: string,
  queryKeys: string[],
  safety: keyof typeof annotations = "read",
) {
  server.tool(name, description, schema, annotations[safety], async (input) => {
    const args = input as Args;
    const resolvedPath = path.replace(/:([A-Za-z]+)/g, (_, key: string) => encodeURIComponent(String(args[key])));
    const query = omitUndefined({
      ...Object.fromEntries(queryKeys.map((key) => [key, args[key]])),
      ...(queryKeys.includes("clientId") ? { clientId: args.clientId ?? defaultClientId } : {}),
    });
    const body = omitUndefined(Object.fromEntries(
      Object.entries(args).filter(([key]) => !queryKeys.includes(key) && !path.includes(`:${key}`)),
    ));
    return textResult(await request(method, resolvedPath, query, body));
  });
}

server.tool("foundry_list_clients", "List Foundry VTT worlds connected to the relay.", {}, annotations.read, async () =>
  textResult(await request("GET", "/clients")),
);

tool(
  "foundry_get_structure",
  "Read folders and document references from a Foundry world.",
  { ...scope, types: z.string().optional(), path: z.string().optional(), recursive: z.boolean().optional(), recursiveDepth: z.number().int().positive().optional(), includeEntityData: z.boolean().optional() },
  "GET", "/structure", ["clientId", "userId", "types", "path", "recursive", "recursiveDepth", "includeEntityData"],
);
tool(
  "foundry_get_entity",
  "Get one Foundry document by UUID, such as Actor.abc123.",
  { ...scope, uuid: z.string().min(1).optional(), selected: z.boolean().optional(), actor: z.boolean().optional() },
  "GET", "/get", ["clientId", "userId", "uuid", "selected", "actor"],
);

// World content and folders
tool("foundry_search", "Search world entities and compendiums.", { ...scope, query: z.string().optional(), filter: z.string().optional(), excludeCompendiums: z.boolean().optional(), limit: z.number().int().positive().max(500).optional(), minified: z.boolean().optional(), ownedByUserId: z.string().optional() }, "GET", "/search", ["clientId", "userId", "query", "filter", "excludeCompendiums", "limit", "minified", "ownedByUserId"]);
tool("foundry_create_entity", "Create a Foundry world entity.", { ...scope, entityType: z.string().min(1), data: json, folder: z.string().optional(), keepId: z.boolean().optional(), override: z.boolean().optional() }, "POST", "/create", ["clientId", "userId"], "write");
tool("foundry_update_entity", "Update a Foundry entity by UUID or the current selection.", { ...scope, uuid: z.string().optional(), selected: z.boolean().optional(), actor: z.boolean().optional(), data: json }, "PUT", "/update", ["clientId", "userId", "uuid", "selected", "actor"], "write");
tool("foundry_delete_entity", "Delete a Foundry entity by UUID or the current selection.", { ...scope, uuid: z.string().optional(), selected: z.boolean().optional() }, "DELETE", "/delete", ["clientId", "userId", "uuid", "selected"], "destructive");
server.tool(
  "foundry_create_actor_embedded_documents",
  "Add Items or ActiveEffects to one actor. Item creation uses the relay's supported Actor items upsert.",
  { ...scope, actorUuid: z.string().min(1).describe("Actor UUID, for example Actor.abc123."), documentType: actorEmbeddedDocumentType, documents: z.array(json).min(1) },
  annotations.write,
  async ({ actorUuid, documentType, documents, clientId, userId }) => {
    const query = omitUndefined({ clientId: clientId ?? defaultClientId, userId });
    if (documentType === "Item") {
      return textResult(await request("PUT", "/update", query, { uuid: actorUuid, data: { items: documents } }));
    }
    const results = await Promise.all(documents.map((effectData) => request("POST", "/effects", query, { uuid: actorUuid, effectData })));
    return textResult(JSON.stringify(results));
  },
);
server.tool(
  "foundry_update_actor_embedded_documents",
  "Update Items or ActiveEffects embedded in one actor.",
  { ...scope, actorUuid: z.string().min(1).describe("Actor UUID, for example Actor.abc123."), documentType: actorEmbeddedDocumentType, documents: z.array(actorEmbeddedDocument).min(1) },
  annotations.write,
  async ({ actorUuid, documentType, documents, clientId, userId }) => {
    const query = omitUndefined({ clientId: clientId ?? defaultClientId, userId });
    const results = await Promise.all(documents.map((document) => {
      const id = String(document._id ?? document.id);
      const { _id, id: ignoredId, ...data } = document;
      return request("PUT", "/update", { ...query, uuid: `${actorUuid}.${documentType}.${id}` }, { data });
    }));
    return textResult(JSON.stringify(results));
  },
);
server.tool(
  "foundry_delete_actor_embedded_documents",
  "Delete Items or ActiveEffects embedded in one actor.",
  { ...scope, actorUuid: z.string().min(1).describe("Actor UUID, for example Actor.abc123."), documentType: actorEmbeddedDocumentType, documentIds: z.array(z.string().min(1)).min(1) },
  annotations.destructive,
  async ({ actorUuid, documentType, documentIds, clientId, userId }) => {
    const query = omitUndefined({ clientId: clientId ?? defaultClientId, userId });
    const results = await Promise.all(documentIds.map((documentId) =>
      request("DELETE", "/delete", { ...query, uuid: `${actorUuid}.${documentType}.${documentId}` }),
    ));
    return textResult(JSON.stringify(results));
  },
);
tool("foundry_get_folder", "Get a folder and its contents by name.", { ...scope, name: z.string().min(1) }, "GET", "/get-folder", ["clientId", "userId", "name"]);
tool("foundry_create_folder", "Create a Foundry folder.", { ...scope, name: z.string().min(1), folderType: z.string().min(1), parentFolderId: z.string().optional() }, "POST", "/create-folder", ["clientId", "userId"], "write");
tool("foundry_delete_folder", "Delete a Foundry folder; deleteAll also deletes its contents.", { ...scope, folderId: z.string().min(1), deleteAll: z.boolean().optional() }, "DELETE", "/delete-folder", ["clientId", "userId", "folderId", "deleteAll"], "destructive");

// Scenes and canvas documents
tool("foundry_get_scenes", "Get one or more scenes.", { ...scope, sceneId: z.string().optional(), name: z.string().optional(), active: z.boolean().optional(), viewed: z.boolean().optional(), all: z.boolean().optional() }, "GET", "/scene", ["clientId", "userId", "sceneId", "name", "active", "viewed", "all"]);
tool("foundry_create_scene", "Create a new scene.", { ...scope, data: json }, "POST", "/scene", ["clientId", "userId"], "write");
tool("foundry_update_scene", "Update a scene by ID, name, or active status.", { ...scope, sceneId: z.string().optional(), name: z.string().optional(), active: z.boolean().optional(), data: json }, "PUT", "/scene", ["clientId", "userId", "sceneId", "name", "active"], "write");
tool("foundry_delete_scene", "Delete a scene by ID or name.", { ...scope, sceneId: z.string().optional(), name: z.string().optional() }, "DELETE", "/scene", ["clientId", "userId", "sceneId", "name"], "destructive");
tool("foundry_switch_scene", "Switch the player-facing active scene.", { ...scope, sceneId: z.string().optional(), name: z.string().optional() }, "POST", "/switch-scene", ["clientId", "userId"], "write");
const canvasScope = { ...scope, documentType: z.enum(["tokens", "tiles", "drawings", "lights", "sounds", "notes", "templates", "walls", "regions"]).describe("Canvas document collection.") };
tool("foundry_get_canvas_documents", "Get canvas embedded documents from a scene.", { ...canvasScope, sceneId: z.string().optional(), documentId: z.string().optional() }, "GET", "/canvas/:documentType", ["clientId", "userId", "sceneId", "documentId"]);
tool("foundry_create_canvas_documents", "Create one or more canvas embedded documents.", { ...canvasScope, sceneId: z.string().optional(), data: canvasData }, "POST", "/canvas/:documentType", ["clientId", "userId"], "write");
tool("foundry_update_canvas_document", "Update one canvas embedded document.", { ...canvasScope, sceneId: z.string().optional(), documentId: z.string().min(1), data: json }, "PUT", "/canvas/:documentType", ["clientId", "userId"], "write");
tool("foundry_delete_canvas_document", "Delete one canvas embedded document.", { ...canvasScope, sceneId: z.string().optional(), documentId: z.string().min(1) }, "DELETE", "/canvas/:documentType", ["clientId", "userId", "sceneId", "documentId"], "destructive");
tool("foundry_move_token", "Move a token to canvas coordinates.", { ...scope, x: z.number(), y: z.number(), uuid: z.string().optional(), name: z.string().optional(), waypoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(), animate: z.boolean().optional(), sceneId: z.string().optional() }, "POST", "/move-token", ["clientId", "userId"], "write");
tool("foundry_measure_distance", "Measure distance between two points or tokens.", { ...scope, originX: z.number().optional(), originY: z.number().optional(), targetX: z.number().optional(), targetY: z.number().optional(), originUuid: z.string().optional(), originName: z.string().optional(), targetUuid: z.string().optional(), targetName: z.string().optional(), sceneId: z.string().optional() }, "GET", "/measure-distance", ["clientId", "userId", "originX", "originY", "targetX", "targetY", "originUuid", "originName", "targetUuid", "targetName", "sceneId"]);
tool("foundry_select_tokens", "Select tokens in the Foundry client.", { ...scope, uuids: z.array(z.string()).optional(), name: z.string().optional(), data: json.optional(), overwrite: z.boolean().optional(), all: z.boolean().optional() }, "POST", "/select", ["clientId", "userId"], "write");
tool("foundry_get_selected_tokens", "Get tokens selected in the Foundry client.", scope, "GET", "/selected", ["clientId", "userId"]);

// Encounters and active effects
tool("foundry_list_encounters", "List active encounters.", scope, "GET", "/encounters", ["clientId", "userId"]);
tool("foundry_start_encounter", "Start an encounter.", { ...scope, tokens: z.array(z.string()).optional(), startWithSelected: z.boolean().optional(), startWithPlayers: z.boolean().optional(), rollNPC: z.boolean().optional(), rollAll: z.boolean().optional(), name: z.string().optional() }, "POST", "/start-encounter", ["clientId", "userId"], "write");
for (const [name, path, description] of [["foundry_next_turn", "/next-turn", "Advance to the next encounter turn."], ["foundry_previous_turn", "/last-turn", "Return to the previous encounter turn."], ["foundry_next_round", "/next-round", "Advance to the next encounter round."], ["foundry_previous_round", "/last-round", "Return to the previous encounter round."], ["foundry_end_encounter", "/end-encounter", "End an encounter."]] as const) tool(name, description, { ...scope, encounter: z.string().optional() }, "POST", path, ["clientId", "userId"], "write");
tool("foundry_add_to_encounter", "Add selected or named tokens to an encounter.", { ...scope, encounter: z.string().optional(), selected: z.boolean().optional(), uuids: z.array(z.string()).optional(), rollInitiative: z.boolean().optional() }, "POST", "/add-to-encounter", ["clientId", "userId"], "write");
tool("foundry_remove_from_encounter", "Remove selected or named tokens from an encounter.", { ...scope, encounter: z.string().optional(), selected: z.boolean().optional(), uuids: z.array(z.string()).optional() }, "POST", "/remove-from-encounter", ["clientId", "userId"], "write");
tool("foundry_get_effects", "Get active effects on an actor or token.", { ...scope, uuid: z.string().min(1) }, "GET", "/effects", ["clientId", "userId", "uuid"]);
tool("foundry_list_status_effects", "List status effects supported by the game system.", scope, "GET", "/effects/list", ["clientId", "userId"]);
tool("foundry_add_effect", "Add a status or custom active effect.", { ...scope, uuid: z.string().min(1), statusId: z.string().optional(), effectData: json.optional() }, "POST", "/effects", ["clientId", "userId"], "write");
tool("foundry_remove_effect", "Remove an active effect by ID or status.", { ...scope, uuid: z.string().min(1), effectId: z.string().optional(), statusId: z.string().optional() }, "DELETE", "/effects", ["clientId", "userId", "uuid"], "destructive");

// Rolls and chat
tool("foundry_roll", "Roll a dice formula.", { ...scope, formula: z.string().min(1), flavor: z.string().optional(), createChatMessage: z.boolean().optional(), speaker: z.string().optional(), whisper: z.array(z.string()).optional() }, "POST", "/roll", ["clientId", "userId"], "write");
tool("foundry_get_last_roll", "Get the latest roll.", scope, "GET", "/lastroll", ["clientId", "userId"]);
tool("foundry_list_rolls", "Get recent rolls.", { ...scope, limit: z.number().int().positive().optional() }, "GET", "/rolls", ["clientId", "userId", "limit"]);
tool("foundry_list_chat_messages", "Get chat messages with optional pagination and filters.", { ...scope, limit: z.number().int().positive().optional(), offset: z.number().int().nonnegative().optional(), chatType: z.number().int().optional(), speaker: z.string().optional() }, "GET", "/chat", ["clientId", "userId", "limit", "offset", "chatType", "speaker"]);
tool("foundry_send_chat_message", "Create a chat message.", { ...scope, content: z.string().min(1), whisper: z.array(z.string()).optional(), speaker: z.string().optional(), alias: z.string().optional(), chatType: z.number().int().optional(), flavor: z.string().optional() }, "POST", "/chat", ["clientId", "userId"], "write");
tool("foundry_delete_chat_message", "Delete one chat message.", { ...scope, messageId: z.string().min(1) }, "DELETE", "/chat/:messageId", ["clientId", "userId"], "destructive");
tool("foundry_clear_chat", "Permanently clear all chat messages.", scope, "DELETE", "/chat", ["clientId", "userId"], "destructive");

await server.connect(new StdioServerTransport());
