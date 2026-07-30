import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [command = process.execPath, ...args] = process.argv.slice(2);
const requests = [];
const fixture = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({ method: request.method, url: request.url, headers: request.headers, body });
  if (request.url?.startsWith("/delete")) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end('{"error":"denied"}');
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, path: request.url }));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const { port } = fixture.address();

const transport = new StdioClientTransport({
  command,
  args: args.length > 0 ? args : ["dist/index.js"],
  env: {
    ...process.env,
    FOUNDRY_REST_API_BASE_URL: `http://127.0.0.1:${port}`,
    FOUNDRY_REST_API_KEY: "smoke-test-key",
    FOUNDRY_CLIENT_ID: "default-client",
  },
});

const client = new Client({ name: "foundry-rest-api-mcp-smoke-test", version: "0.4.0" });
const expectedTools = [
  "foundry_add_effect", "foundry_add_to_encounter", "foundry_clear_chat", "foundry_create_canvas_documents",
  "foundry_create_actor_embedded_documents", "foundry_create_entity", "foundry_create_folder", "foundry_create_scene", "foundry_delete_actor_embedded_documents", "foundry_delete_canvas_document",
  "foundry_delete_chat_message", "foundry_delete_entity", "foundry_delete_folder", "foundry_delete_scene",
  "foundry_download_file",
  "foundry_end_encounter", "foundry_get_canvas_documents", "foundry_get_effects", "foundry_get_entity",
  "foundry_get_folder", "foundry_get_last_roll", "foundry_get_scenes", "foundry_get_selected_tokens",
  "foundry_get_structure", "foundry_list_chat_messages", "foundry_list_clients", "foundry_list_encounters", "foundry_list_files",
  "foundry_list_rolls", "foundry_list_status_effects", "foundry_measure_distance", "foundry_move_token",
  "foundry_next_round", "foundry_next_turn", "foundry_previous_round", "foundry_previous_turn",
  "foundry_remove_effect", "foundry_remove_from_encounter", "foundry_roll", "foundry_search", "foundry_select_tokens",
  "foundry_send_chat_message", "foundry_start_encounter", "foundry_switch_scene", "foundry_update_canvas_document",
  "foundry_update_actor_embedded_documents", "foundry_update_entity", "foundry_update_scene", "foundry_upload_file",
].sort();

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), expectedTools);

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get("foundry_get_scenes")?.annotations?.readOnlyHint, true);
  assert.equal(byName.get("foundry_create_entity")?.annotations?.readOnlyHint, false);
  assert.equal(byName.get("foundry_delete_scene")?.annotations?.destructiveHint, true);
  assert.equal(byName.get("foundry_delete_actor_embedded_documents")?.annotations?.destructiveHint, true);
  assert.equal(byName.get("foundry_clear_chat")?.annotations?.destructiveHint, true);

  const search = await client.callTool({ name: "foundry_search", arguments: { query: "Ada", limit: 5 } });
  assert.equal(search.isError, undefined);
  await client.callTool({ name: "foundry_create_entity", arguments: { clientId: "client-1", entityType: "Actor", data: { name: "Ada" } } });
  await client.callTool({ name: "foundry_update_scene", arguments: { sceneId: "scene-1", data: { name: "New name" } } });
  await client.callTool({ name: "foundry_delete_canvas_document", arguments: { documentType: "tokens", documentId: "token-1" } });
  await client.callTool({ name: "foundry_create_actor_embedded_documents", arguments: { actorUuid: "Actor.ada", documentType: "Item", documents: [{ name: "Rope", type: "loot" }] } });
  await client.callTool({ name: "foundry_update_actor_embedded_documents", arguments: { actorUuid: "Actor.ada", documentType: "Item", documents: [{ _id: "rope-1", name: "Silk Rope" }] } });
  await client.callTool({ name: "foundry_delete_actor_embedded_documents", arguments: { actorUuid: "Actor.ada", documentType: "Item", documentIds: ["rope-1"] } });
  await client.callTool({ name: "foundry_list_files", arguments: { source: "data", path: "assets", recursive: true } });
  await client.callTool({ name: "foundry_download_file", arguments: { source: "data", path: "assets/map.png", format: "base64" } });
  await client.callTool({ name: "foundry_upload_file", arguments: { source: "data", path: "assets", filename: "note.txt", mimeType: "text/plain", fileData: "data:text/plain;base64,SGVsbG8=", overwrite: true } });
  const error = await client.callTool({ name: "foundry_delete_entity", arguments: { uuid: "Actor.denied" } });
  assert.equal(error.isError, true);

  assert.deepEqual(requests.slice(0, 4).map(({ method, url }) => ({ method, url })), [
    { method: "GET", url: "/search?clientId=default-client&query=Ada&limit=5" },
    { method: "POST", url: "/create?clientId=client-1" },
    { method: "PUT", url: "/scene?clientId=default-client&sceneId=scene-1" },
    { method: "DELETE", url: "/canvas/tokens?clientId=default-client&documentId=token-1" },
  ]);
  assert.equal(requests[1].headers["x-api-key"], "smoke-test-key");
  assert.deepEqual(JSON.parse(requests[1].body), { entityType: "Actor", data: { name: "Ada" } });
  assert.deepEqual(JSON.parse(requests[2].body), { data: { name: "New name" } });
  assert.equal(requests[4].url, "/update?clientId=default-client&uuid=Actor.ada");
  assert.deepEqual(JSON.parse(requests[4].body), { data: { items: [{ name: "Rope", type: "loot" }] } });
  assert.equal(requests[5].url, "/update?clientId=default-client&uuid=Actor.ada.Item.rope-1");
  assert.deepEqual(JSON.parse(requests[5].body), { data: { name: "Silk Rope" } });
  assert.equal(requests[6].url, "/delete?clientId=default-client&uuid=Actor.ada.Item.rope-1");
  assert.equal(requests[7].url, "/file-system?clientId=default-client&path=assets&source=data&recursive=true");
  assert.equal(requests[8].url, "/download?clientId=default-client&path=assets%2Fmap.png&source=data&format=base64");
  assert.equal(requests[9].url, "/upload?clientId=default-client&path=assets&filename=note.txt&source=data&mimeType=text%2Fplain");
  assert.deepEqual(JSON.parse(requests[9].body), { fileData: "data:text/plain;base64,SGVsbG8=", overwrite: true });
  assert.equal(requests[10].url, "/delete?clientId=default-client&uuid=Actor.denied");
} finally {
  await client.close();
  await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
}
