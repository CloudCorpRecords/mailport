/**
 * mailport core: a 10-tool core subset of the Gmail reference MCP
 * server surface, implemented clean-room against the public Gmail API
 * documentation (base https://gmail.googleapis.com/gmail/v1,
 * overridable via GMAIL_API_URL).
 *
 * Auth: GOOGLE_ACCESS_TOKEN, sent as `Authorization: Bearer`.
 * A missing token is an error naming the variable. All HTTP goes
 * through an injected FetchFn so the wire behaviour is testable
 * offline.
 */
import type {
  CreateDraftOptions,
  CreateLabelOptions,
  FetchFn,
  GetMessageOptions,
  GetThreadOptions,
  ListLabelsOptions,
  ListMessagesOptions,
  ListThreadsOptions,
  ModifyMessageOptions,
  SendMessageOptions,
  TrashMessageOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export function tokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.GOOGLE_ACCESS_TOKEN;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    throw new Error("GOOGLE_ACCESS_TOKEN environment variable is required");
  }
  return token;
}

export function baseFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.GMAIL_API_URL;
  const base = typeof raw === "string" ? raw.trim() : "";
  return (base || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export const apiBaseFromEnv = baseFromEnv;

const enc = encodeURIComponent;

interface RequestSpec {
  method: string;
  url: string;
  body?: unknown;
}

async function apiRequest(
  fetchFn: FetchFn,
  token: string,
  spec: RequestSpec,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (spec.body !== undefined) {
    body = JSON.stringify(spec.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetchFn(spec.url, { method: spec.method, headers, body });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const errObj = parsed.error as Record<string, unknown> | undefined;
      if (errObj && typeof errObj.message === "string") detail = errObj.message;
      else if (typeof parsed.message === "string") detail = parsed.message;
    } catch {
      // Keep the raw body as the detail.
    }
    throw new Error(`Gmail API error ${res.status}: ${detail}`);
  }
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${enc(key)}=${enc(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Build an RFC822 message and base64url-encode it for the Gmail API. */
export function buildRawMessage(opts: SendMessageOptions): string {
  const headers = [`To: ${opts.to}`, `Subject: ${opts.subject}`];
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
  const rfc822 = `${headers.join("\r\n")}\r\n\r\n${opts.body}`;
  return Buffer.from(rfc822, "utf-8").toString("base64url");
}

export async function listMessages(
  fetchFn: FetchFn, token: string, base: string, opts: ListMessagesOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/users/me/messages${query({
      q: opts.query,
      maxResults: opts.max_results,
      labelIds: opts.label_ids ? opts.label_ids.join(",") : undefined,
    })}`,
  });
}

export async function getMessage(
  fetchFn: FetchFn, token: string, base: string, opts: GetMessageOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/users/me/messages/${enc(opts.message_id)}${query({ format: opts.format })}`,
  });
}

export async function listThreads(
  fetchFn: FetchFn, token: string, base: string, opts: ListThreadsOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/users/me/threads${query({ q: opts.query, maxResults: opts.max_results })}`,
  });
}

export async function getThread(
  fetchFn: FetchFn, token: string, base: string, opts: GetThreadOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/users/me/threads/${enc(opts.thread_id)}`,
  });
}

export async function listLabels(
  fetchFn: FetchFn, token: string, base: string, _opts: ListLabelsOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "GET",
    url: `${base}/users/me/labels`,
  });
}

export async function sendMessage(
  fetchFn: FetchFn, token: string, base: string, opts: SendMessageOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/users/me/messages/send`,
    body: { raw: buildRawMessage(opts) },
  });
}

export async function createDraft(
  fetchFn: FetchFn, token: string, base: string, opts: CreateDraftOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/users/me/drafts`,
    body: { message: { raw: buildRawMessage(opts) } },
  });
}

export async function modifyMessage(
  fetchFn: FetchFn, token: string, base: string, opts: ModifyMessageOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (opts.add_label_ids) body.addLabelIds = opts.add_label_ids;
  if (opts.remove_label_ids) body.removeLabelIds = opts.remove_label_ids;
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/users/me/messages/${enc(opts.message_id)}/modify`,
    body,
  });
}

export async function trashMessage(
  fetchFn: FetchFn, token: string, base: string, opts: TrashMessageOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/users/me/messages/${enc(opts.message_id)}/trash`,
  });
}

export async function createLabel(
  fetchFn: FetchFn, token: string, base: string, opts: CreateLabelOptions,
): Promise<unknown> {
  return apiRequest(fetchFn, token, {
    method: "POST",
    url: `${base}/users/me/labels`,
    body: { name: opts.name },
  });
}

/** Dispatch a tool call by name. Used by both the MCP server and the CLI. */
export async function callTool(
  fetchFn: FetchFn,
  token: string,
  base: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_messages":
      return listMessages(fetchFn, token, base, args as unknown as ListMessagesOptions);
    case "get_message":
      return getMessage(fetchFn, token, base, args as unknown as GetMessageOptions);
    case "list_threads":
      return listThreads(fetchFn, token, base, args as unknown as ListThreadsOptions);
    case "get_thread":
      return getThread(fetchFn, token, base, args as unknown as GetThreadOptions);
    case "list_labels":
      return listLabels(fetchFn, token, base, args as unknown as ListLabelsOptions);
    case "send_message":
      return sendMessage(fetchFn, token, base, args as unknown as SendMessageOptions);
    case "create_draft":
      return createDraft(fetchFn, token, base, args as unknown as CreateDraftOptions);
    case "modify_message":
      return modifyMessage(fetchFn, token, base, args as unknown as ModifyMessageOptions);
    case "trash_message":
      return trashMessage(fetchFn, token, base, args as unknown as TrashMessageOptions);
    case "create_label":
      return createLabel(fetchFn, token, base, args as unknown as CreateLabelOptions);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
