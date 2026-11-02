#!/usr/bin/env node
/**
 * mailport CLI.
 *   mailport <tool-name> '<json args>'
 *   mailport mcp
 * Requires GOOGLE_ACCESS_TOKEN. Exit codes: 0 success, 1 error, 2 usage.
 */
import { baseFromEnv, callTool, tokenFromEnv, VERSION } from "./gmail.js";
import type { FetchFn } from "./types.js";

const TOOL_NAMES = [
  "list_messages", "get_message", "list_threads", "get_thread",
  "list_labels", "send_message", "create_draft", "modify_message",
  "trash_message", "create_label",
];

function usage(): never {
  console.error(`Usage:
  mailport <tool> '<json args>'   tools: ${TOOL_NAMES.join(", ")}
  mailport mcp
  mailport --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOL_NAMES.includes(cmd)) usage();
  let args: Record<string, unknown> = {};
  const raw = rest.join(" ").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("error: args must be a JSON object");
      process.exit(1);
    }
  }
  try {
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    const out = await callTool(fetchFn, tokenFromEnv(), baseFromEnv(), cmd, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
