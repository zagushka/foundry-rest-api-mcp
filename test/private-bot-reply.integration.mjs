import assert from "node:assert/strict";

const required = [
  "FOUNDRY_REST_API_BASE_URL",
  "FOUNDRY_BOT_API_KEY",
  "FOUNDRY_PLAYER_API_KEY",
  "FOUNDRY_OTHER_PLAYER_API_KEY",
  "FOUNDRY_BOT_USER_ID",
  "FOUNDRY_PLAYER_USER_ID",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.log(`Skipping private bot reply integration test; missing ${missing.join(", ")}.`);
  process.exit(0);
}

const baseUrl = process.env.FOUNDRY_REST_API_BASE_URL.replace(/\/$/, "");
const botId = process.env.FOUNDRY_BOT_USER_ID;
const playerId = process.env.FOUNDRY_PLAYER_USER_ID;
const marker = `mcp-private-bot-reply-${crypto.randomUUID()}`;

async function relay(apiKey, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "x-api-key": apiKey, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.equal(response.ok, true, `${method} ${path}: ${text}`);
  return JSON.parse(text);
}

// This models the inbound player whisper. The scoped key forces its userId server-side.
await relay(process.env.FOUNDRY_PLAYER_API_KEY, "POST", "/chat", {
  content: `${marker}: question`, whisper: [botId], chatType: 3,
});

// This is the request emitted by foundry_send_chat_as_user. The relay must force the
// bot-scoped identity even though userId is supplied in the query.
const sent = await relay(process.env.FOUNDRY_BOT_API_KEY, "POST", `/chat?userId=${encodeURIComponent(botId)}`, {
  content: `${marker}: reply`, whisper: [playerId], chatType: 3,
});
const message = sent.data ?? sent;
assert.equal(message.author?.id, botId, "reply must be authored by the bot user");
assert.deepEqual(message.whisper, [playerId], "reply must target only the initiating player");
assert.ok(message.type === "whisper" || message.chatType === 3, "reply must be a Whisper");

const otherMessagesResult = await relay(process.env.FOUNDRY_OTHER_PLAYER_API_KEY, "GET", "/chat?limit=100");
const otherMessages = (otherMessagesResult.data ?? otherMessagesResult).messages ?? [];
assert.equal(otherMessages.some((item) => item.id === message.id || item.content === message.content), false, "other players must not receive the private reply");

console.log(`Private bot reply verified: ${message.id}`);
