# Foundry REST API MCP

A minimal, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for the [FoundryVTT REST API Relay](https://foundryrestapi.com/docs/intro).

## Included tools

- `foundry_list_clients` — list connected Foundry worlds
- `foundry_get_structure` — read folders and entity references
- `foundry_get_entity` — get a document by Foundry UUID

The server does not expose mutations, macro execution, chat posting, or arbitrary JavaScript execution.

## Requirements

- Node.js 20 or newer
- A paired `foundry-rest-api` module and relay
- A scoped API key with `clients:read`, `structure:read`, and `entity:read`

## Install in Codex directly from GitHub

Add the following to your user-level `~/.codex/config.toml`:

```toml
[mcp_servers.foundry]
command = "npx"
args = [
  "--yes",
  "github:zagushka/foundry-rest-api-mcp#v0.1.0"
]

[mcp_servers.foundry.env]
FOUNDRY_REST_API_BASE_URL = "http://localhost:3011"
FOUNDRY_REST_API_KEY = "replace-with-a-scoped-secret"
# Optional. Omit when the key is bound to exactly one Foundry world.
# FOUNDRY_CLIENT_ID = "fvtt_..."
```

Restart Codex after changing its configuration. Codex starts the stdio server automatically; do not start it separately.

To inherit values already present in the environment instead of writing them in `config.toml`, replace the `[mcp_servers.foundry.env]` table with:

```toml
[mcp_servers.foundry]
command = "npx"
args = [
  "--yes",
  "github:zagushka/foundry-rest-api-mcp#v0.1.0"
]
env_vars = [
  "FOUNDRY_REST_API_BASE_URL",
  "FOUNDRY_REST_API_KEY",
  "FOUNDRY_CLIENT_ID"
]
```

The Git tag pins the installed version. Change `v0.1.0` when upgrading to a newer release.

## Optional global installation

```sh
npm install --global github:zagushka/foundry-rest-api-mcp#v0.1.0
```

After that, configure Codex with:

```toml
[mcp_servers.foundry]
command = "foundry-rest-api-mcp"

[mcp_servers.foundry.env]
FOUNDRY_REST_API_BASE_URL = "http://localhost:3011"
FOUNDRY_REST_API_KEY = "replace-with-a-scoped-secret"
```

## Local development

```sh
git clone https://github.com/zagushka/foundry-rest-api-mcp.git
cd foundry-rest-api-mcp
npm ci
npm test
```

For manual local runs, copy `.env.example` to `.env`, fill in the values, then run:

```sh
npm run build
npm run start:env
```

This is a stdio MCP server. It waits for an MCP client and does not open an HTTP port.
