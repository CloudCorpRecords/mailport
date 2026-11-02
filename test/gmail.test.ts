import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRawMessage,
  createDraft,
  createLabel,
  getMessage,
  getThread,
  listLabels,
  listMessages,
  listThreads,
  modifyMessage,
  sendMessage,
  tokenFromEnv,
  trashMessage,
} from "../src/gmail.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(steps: Array<{ payload: unknown; status?: number }>) {
  const calls: Recorded[] = [];
  const queue = [...steps];
  const fn: FetchFn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
    const step = queue.shift() ?? { payload: {} };
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(step.payload),
    };
    return res;
  };
  return { fn, calls };
}

const BASE = "https://gmail.googleapis.com/gmail/v1";
const TOKEN = "test-token";

function decodeRaw(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf-8");
}

describe("mailport core", () => {
  it("names the env var when the token is missing", () => {
    assert.throws(() => tokenFromEnv({}), /GOOGLE_ACCESS_TOKEN environment variable is required/);
    assert.throws(() => tokenFromEnv({ GOOGLE_ACCESS_TOKEN: " " }), /GOOGLE_ACCESS_TOKEN/);
    assert.equal(tokenFromEnv({ GOOGLE_ACCESS_TOKEN: " x " }), "x");
  });

  it("list_messages shapes q, maxResults and comma-joined labelIds with Bearer auth", async () => {
    const { fn, calls } = fakeFetch([{ payload: { messages: [] } }]);
    await listMessages(fn, TOKEN, BASE, { query: "in:inbox", max_results: 7, label_ids: ["INBOX", "UNREAD"] });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, "Bearer test-token");
    assert.ok(calls[0].url.startsWith(`${BASE}/users/me/messages?`));
    assert.ok(calls[0].url.includes("q=in%3Ainbox"));
    assert.ok(calls[0].url.includes("maxResults=7"));
    assert.ok(calls[0].url.includes("labelIds=INBOX%2CUNREAD"));
  });

  it("list_messages with no options hits the bare messages path", async () => {
    const { fn, calls } = fakeFetch([{ payload: { messages: [] } }]);
    await listMessages(fn, TOKEN, BASE, {});
    assert.equal(calls[0].url, `${BASE}/users/me/messages`);
  });

  it("get_message shapes id and format", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "m1" } }]);
    await getMessage(fn, TOKEN, BASE, { message_id: "m1", format: "full" });
    assert.equal(calls[0].url, `${BASE}/users/me/messages/m1?format=full`);
  });

  it("list_threads and get_thread shape thread paths", async () => {
    const { fn, calls } = fakeFetch([{ payload: { threads: [] } }, { payload: { id: "t1" } }]);
    await listThreads(fn, TOKEN, BASE, { query: "newer:2026/01/01", max_results: 3 });
    assert.ok(calls[0].url.includes("/users/me/threads?"));
    assert.ok(calls[0].url.includes("maxResults=3"));
    await getThread(fn, TOKEN, BASE, { thread_id: "t1" });
    assert.equal(calls[1].url, `${BASE}/users/me/threads/t1`);
  });

  it("list_labels gets /users/me/labels", async () => {
    const { fn, calls } = fakeFetch([{ payload: { labels: [{ id: "INBOX" }] } }]);
    const out = (await listLabels(fn, TOKEN, BASE, {})) as Record<string, unknown>;
    assert.ok(Array.isArray(out.labels));
    assert.equal(calls[0].url, `${BASE}/users/me/labels`);
    assert.equal(calls[0].method, "GET");
  });

  it("buildRawMessage base64url-decodes to RFC822 headers and body", () => {
    const raw = buildRawMessage({ to: "a@example.com", subject: "Hi there", body: "Body text", cc: "c@example.com", bcc: "b@example.com" });
    assert.ok(!raw.includes("+") && !raw.includes("/") && !raw.includes("="));
    const decoded = decodeRaw(raw);
    assert.ok(decoded.startsWith("To: a@example.com\r\nSubject: Hi there"));
    assert.ok(decoded.includes("\r\nCc: c@example.com"));
    assert.ok(decoded.includes("\r\nBcc: b@example.com"));
    assert.ok(decoded.endsWith("\r\n\r\nBody text"));
  });

  it("send_message posts {raw} to messages/send", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "sent1" } }]);
    await sendMessage(fn, TOKEN, BASE, { to: "x@example.com", subject: "S", body: "B" });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/users/me/messages/send`);
    const body = calls[0].body as { raw: string };
    assert.equal(decodeRaw(body.raw), "To: x@example.com\r\nSubject: S\r\n\r\nB");
  });

  it("create_draft posts {message:{raw}} to drafts", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "d1" } }]);
    await createDraft(fn, TOKEN, BASE, { to: "y@example.com", subject: "Draft subj", body: "Draft body" });
    assert.equal(calls[0].url, `${BASE}/users/me/drafts`);
    const body = calls[0].body as { message: { raw: string } };
    assert.ok(decodeRaw(body.message.raw).includes("Subject: Draft subj"));
    assert.ok(decodeRaw(body.message.raw).endsWith("Draft body"));
  });

  it("modify_message posts add/remove label ids", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "m9" } }]);
    await modifyMessage(fn, TOKEN, BASE, { message_id: "m9", add_label_ids: ["STARRED"], remove_label_ids: ["UNREAD"] });
    assert.equal(calls[0].url, `${BASE}/users/me/messages/m9/modify`);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] });
  });

  it("modify_message omits label arrays that were not provided", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "m9" } }]);
    await modifyMessage(fn, TOKEN, BASE, { message_id: "m9", add_label_ids: ["IMPORTANT"] });
    assert.deepEqual(calls[0].body, { addLabelIds: ["IMPORTANT"] });
  });

  it("trash_message posts to the trash endpoint", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "m2" } }]);
    await trashMessage(fn, TOKEN, BASE, { message_id: "m2" });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/users/me/messages/m2/trash`);
  });

  it("create_label posts {name} to labels", async () => {
    const { fn, calls } = fakeFetch([{ payload: { id: "Label_1", name: "Receipts" } }]);
    await createLabel(fn, TOKEN, BASE, { name: "Receipts" });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${BASE}/users/me/labels`);
    assert.deepEqual(calls[0].body, { name: "Receipts" });
  });

  it("surfaces upstream error status and message", async () => {
    const { fn } = fakeFetch([{ payload: { error: { message: "Invalid credentials" } }, status: 401 }]);
    await assert.rejects(
      () => listMessages(fn, TOKEN, BASE, {}),
      /Gmail API error 401: Invalid credentials/,
    );
  });
});
