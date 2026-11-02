/**
 * mailport MCP server. Core subset: 10 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * labelled core-subset fixture exactly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { baseFromEnv, callTool, tokenFromEnv, VERSION } from "./gmail.js";
import type { FetchFn } from "./types.js";

const MailHeaders = {
  to: z.string(), subject: z.string(), body: z.string(),
  cc: z.string().optional(), bcc: z.string().optional(),
};
const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  list_messages: z.object({
    query: z.string().optional(), max_results: z.number().optional(),
    label_ids: z.array(z.string()).optional(),
  }),
  get_message: z.object({
    message_id: z.string(), format: z.string().optional(),
  }),
  list_threads: z.object({
    query: z.string().optional(), max_results: z.number().optional(),
  }),
  get_thread: z.object({ thread_id: z.string() }),
  list_labels: z.object({}),
  send_message: z.object({ ...MailHeaders }),
  create_draft: z.object({ ...MailHeaders }),
  modify_message: z.object({
    message_id: z.string(),
    add_label_ids: z.array(z.string()).optional(),
    remove_label_ids: z.array(z.string()).optional(),
  }),
  trash_message: z.object({ message_id: z.string() }),
  create_label: z.object({ name: z.string() }),
};

export const TOOLS = [
  {
    name: "list_messages",
    description: "List messages in the user's Gmail mailbox, optionally filtered by a search query or labels.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Optional Gmail search query to filter messages by." }, max_results: { type: "number", description: "Optional maximum number of messages to return." },
        label_ids: { type: "array", items: { type: "string" }, description: "Optional list of label IDs; only messages carrying all of these labels are returned." },
      },
      required: [],
    },
  },
  {
    name: "get_message",
    description: "Get a single Gmail message by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message_id: { type: "string", description: "The unique identifier of the Gmail message to retrieve." }, format: { type: "string", description: "Optional Gmail message format to return, such as full, minimal, raw, or metadata." },
      },
      required: ["message_id"],
    },
  },
  {
    name: "list_threads",
    description: "List threads in the user's Gmail mailbox, optionally filtered by a search query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Optional Gmail search query to filter threads by." }, max_results: { type: "number", description: "Optional maximum number of threads to return." },
      },
      required: [],
    },
  },
  {
    name: "get_thread",
    description: "Get a single Gmail thread by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: { thread_id: { type: "string", description: "The unique identifier of the Gmail thread to retrieve." } },
      required: ["thread_id"],
    },
  },
  {
    name: "list_labels",
    description: "List all labels in the user's Gmail mailbox.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "send_message",
    description: "Send a new email message via Gmail.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "The recipient email address for the To header." }, subject: { type: "string", description: "The subject line of the message." },
        body: { type: "string", description: "The plain-text body of the message." }, cc: { type: "string", description: "Optional email address to copy in the Cc header." },
        bcc: { type: "string", description: "Optional email address to blind-copy in the Bcc header." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_draft",
    description: "Create a new Gmail draft message.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "The recipient email address for the To header." }, subject: { type: "string", description: "The subject line of the draft." },
        body: { type: "string", description: "The plain-text body of the draft." }, cc: { type: "string", description: "Optional email address to copy in the Cc header." },
        bcc: { type: "string", description: "Optional email address to blind-copy in the Bcc header." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "modify_message",
    description: "Add or remove labels on a Gmail message.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message_id: { type: "string", description: "The unique identifier of the Gmail message to modify." },
        add_label_ids: { type: "array", items: { type: "string" }, description: "Optional list of label IDs to add to the message." },
        remove_label_ids: { type: "array", items: { type: "string" }, description: "Optional list of label IDs to remove from the message." },
      },
      required: ["message_id"],
    },
  },
  {
    name: "trash_message",
    description: "Move a Gmail message to the trash.",
    inputSchema: {
      type: "object" as const,
      properties: { message_id: { type: "string", description: "The unique identifier of the Gmail message to move to the trash." } },
      required: ["message_id"],
    },
  },
  {
    name: "create_label",
    description: "Create a new label in the user's Gmail mailbox.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "The name of the new label to create." } },
      required: ["name"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const server = new Server(
  { name: "mailport", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const token = tokenFromEnv();
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, token, baseFromEnv(), name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
