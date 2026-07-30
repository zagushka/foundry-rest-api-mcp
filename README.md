# Foundry REST API MCP

[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/protocol-MCP-5A45FF)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io/) server that lets MCP clients work with a Foundry VTT world through the [FoundryVTT REST API Relay](https://github.com/ThreeHats/foundryvtt-rest-api-relay). It is the client-facing component of the ThreeHats ecosystem:

```text
Foundry VTT + REST API Module  <-- WebSocket -->  REST API Relay  <-- HTTPS -->  this MCP server
```

The MCP server connects to the relay's **HTTP(S) API**. Do not use the module's `ws://` or `wss://` relay URL for `FOUNDRY_REST_API_BASE_URL`.

## Ecosystem and compatibility

| Component | Role |
| --- | --- |
| [FoundryVTT REST API Module](https://github.com/ThreeHats/foundryvtt-rest-api) | Connects a Foundry world to the relay over WebSocket. |
| [FoundryVTT REST API Relay](https://github.com/ThreeHats/foundryvtt-rest-api-relay) | Exposes the authenticated HTTP API used by this server. |
| **Foundry REST API MCP** | Exposes supported relay operations as typed `foundry_*` MCP tools. |

Use the upstream [relay documentation](https://foundryrestapi.com/docs/intro) for module pairing, relay deployment, API-key management, and the complete REST API reference.

This project supports the relay's optional `clientId` and `userId` request scoping. A scoped API key can bind either value so the MCP client does not need to provide it. A key scoped to one world therefore does not require `FOUNDRY_CLIENT_ID`.

## Quick start

1. Install and pair the [Foundry module](https://github.com/ThreeHats/foundryvtt-rest-api) with either the public relay or your self-hosted relay.
2. Create an API key in the relay with only the scopes needed for the tools you intend to use.
3. Add this server to Codex in `~/.codex/config.toml`:

```toml
[mcp_servers.foundry]
command = "npx"
args = [
  "--yes",
  "github:zagushka/foundry-rest-api-mcp#v0.4.0"
]

[mcp_servers.foundry.env]
# Public relay:
FOUNDRY_REST_API_BASE_URL = "https://foundryrestapi.com"
FOUNDRY_REST_API_KEY = "replace-with-a-scoped-secret"

# Optional: omit when the key is already scoped to exactly one world.
# FOUNDRY_CLIENT_ID = "fvtt_..."
```

Restart Codex after changing the configuration. Codex starts this stdio server automatically; it does not expose its own HTTP port.

### Self-hosted relay

Use the HTTP API address of your relay instead of its WebSocket address. The standard local relay API listens on port `3011`:

```toml
[mcp_servers.foundry.env]
FOUNDRY_REST_API_BASE_URL = "http://localhost:3011"
FOUNDRY_REST_API_KEY = "replace-with-a-scoped-secret"
# FOUNDRY_CLIENT_ID = "fvtt_..."
```

If Codex should inherit variables already available in its environment, use `env_vars` instead:

```toml
[mcp_servers.foundry]
command = "npx"
args = [
  "--yes",
  "github:zagushka/foundry-rest-api-mcp#v0.4.0"
]
env_vars = [
  "FOUNDRY_REST_API_BASE_URL",
  "FOUNDRY_REST_API_KEY",
  "FOUNDRY_CLIENT_ID"
]
```

The Git tag pins the installed release. Change it deliberately when upgrading.

## Supported tools and permissions

All exposed tools begin with `foundry_` and publish typed MCP parameters. Request the smallest set of relay scopes needed for the tools you enable:

| Tool group | Capabilities | Relay scopes |
| --- | --- | --- |
| World content and folders | List worlds; inspect, search, create, update, and delete entities and folders | `clients:read`, `structure:read`, `structure:write`, `entity:read`, `entity:write`, `search` |
| Actor inventory and effects | Add, update, and delete embedded `Item` and `ActiveEffect` documents | `entity:write`, `effects:write` |
| Files | Browse file sources, download files, and upload base64-encoded files | `file:read`, `file:write` |
| Scenes and canvas | Manage scenes, canvas documents, token movement, selection, and distance measurement | `scene:read`, `scene:write`, `canvas:read`, `canvas:write` |
| Encounters and effects | Read and manage combats, combatants, turns, and active effects | `encounter:read`, `encounter:manage`, `effects:read`, `effects:write` |
| Table play | Roll dice and read, send, or delete chat messages | `roll:read`, `roll:execute`, `chat:read`, `chat:write` |

Read-only tools advertise `readOnlyHint: true`. Tools that change world state advertise `readOnlyHint: false`; deletion tools and chat clearing also advertise `destructiveHint: true`. Treat a key that grants write scopes as a privileged credential and keep it outside Git.

### Actor embedded documents

Use `foundry_create_actor_embedded_documents`, `foundry_update_actor_embedded_documents`, and `foundry_delete_actor_embedded_documents` to manage one actor's embedded `Item` or `ActiveEffect` documents. Pass the actor UUID (for example, `Actor.abc123`) and an array of document data or IDs. Updates require each document's `_id` or `id`.

The relay exposes no dedicated `Actor.createEmbeddedDocuments` route. For items, the create tool uses its supported actor `items` upsert; for effects, it uses the relay's effect endpoint. Updating and deleting target the embedded document UUIDs directly.

The server deliberately does **not** expose D&D5e-specific operations, Foundry-user management, sessions, macros, playlists, arbitrary JavaScript, relay authentication management, or SSE/WebSocket subscriptions. Use the upstream API directly when one of those capabilities is required.

## Local development

```sh
git clone https://github.com/zagushka/foundry-rest-api-mcp.git
cd foundry-rest-api-mcp
npm ci
npm test
```

For a manual local run, copy `.env.example` to `.env`, fill in the relay address and API key, then run:

```sh
npm run build
npm run start:env
```

## License

[MIT](LICENSE) © Peter Pshenichny
