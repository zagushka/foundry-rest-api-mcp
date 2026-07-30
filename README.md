# Foundry REST API MCP

A minimal, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for the [FoundryVTT REST API Relay](https://foundryrestapi.com/docs/intro).

## Included tools

- `foundry_list_clients` — connected Foundry worlds
- `foundry_get_structure` — folders and entity references
- `foundry_get_entity` — a document by Foundry UUID

The server does not expose mutations, macro execution, chat posting, or arbitrary JavaScript execution.

## Setup

1. Install and pair the `foundry-rest-api` module with a relay.
2. Create a scoped API key with only `clients:read`, `structure:read`, and `entity:read`.
3. Copy `.env.example` to `.env` and fill in the values. The relay's HTTP URL is usually `http://localhost:3011` for local use; do not use the module's `wss://` URL here.
4. Install and compile:

```sh
npm install
npm run build
```

To start it directly (useful for an MCP inspector), run `npm start`. The process uses stdio, so it waits for an MCP client rather than opening an HTTP port.

## Codex MCP configuration

Add this server to your Codex MCP configuration, replacing the absolute path:

```toml
[mcp_servers.foundry]
command = "node"
args = ["/absolute/path/to/foundry-rest-api-mcp/dist/index.js"]

[mcp_servers.foundry.env]
FOUNDRY_REST_API_BASE_URL = "http://localhost:3011"
FOUNDRY_REST_API_KEY = "replace-with-a-scoped-secret"
# Optional. Omit this line when the key is bound to exactly one Foundry world.
# FOUNDRY_CLIENT_ID = "fvtt_..."
```

Restart Codex after changing its MCP configuration.

## Development

```sh
npm run dev
npm run check
```

Use `npm run build` before configuring the production command.
