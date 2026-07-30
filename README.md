# Foundry REST API MCP

A [Model Context Protocol](https://modelcontextprotocol.io/) server for preparing Foundry worlds and running encounters through the [FoundryVTT REST API Relay](https://foundryrestapi.com/docs/intro).

## Included tools

- World content — list worlds, inspect structure and entities, search, and create, update, or delete entities and folders.
- Scenes and canvas — create, update, delete, and switch scenes; manage tokens, walls, lights, tiles, drawings, sounds, notes, templates, and regions.
- Encounters and effects — start/end combat, control turns and rounds, change combatants, and manage active effects.
- Table play — roll dice, read and write chat, select or move tokens, and measure distances.

All tools are named `foundry_*`; use the MCP tool list for their typed parameters. Commands that change the world carry `readOnlyHint: false`; destructive deletions and chat clearing also carry `destructiveHint: true`.

This compact server intentionally excludes D&D5e-specific actions, files, users, sessions, macros, playlists, arbitrary JavaScript, authentication management, and SSE/WebSocket subscriptions.

## Requirements

- Node.js 20 or newer
- A paired `foundry-rest-api` module and relay
- A scoped API key with the required relay permissions: `clients:read`, `structure:read`, `structure:write`, `entity:read`, `entity:write`, `search`, `scene:read`, `scene:write`, `canvas:read`, `canvas:write`, `encounter:read`, `encounter:manage`, `effects:read`, `effects:write`, `roll:read`, `roll:execute`, `chat:read`, and `chat:write`

## Install in Codex directly from GitHub

Add the following to your user-level `~/.codex/config.toml`:

```toml
[mcp_servers.foundry]
command = "npx"
args = [
  "--yes",
  "github:zagushka/foundry-rest-api-mcp#v0.2.0"
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

The Git tag pins the installed version. Change `v0.2.0` when upgrading to a newer release.

## Optional global installation

```sh
npm install --global github:zagushka/foundry-rest-api-mcp#v0.2.0
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
