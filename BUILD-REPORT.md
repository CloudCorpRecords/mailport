# mailport — BUILD REPORT

Original: gmail (Gmail reference MCP server) → Rebuild: mailport
Tier C core subset. Local only, nothing pushed or published.

## Scope
10 tools against the Gmail API (https://gmail.googleapis.com/gmail/v1,
base overridable via GMAIL_API_URL), Authorization: Bearer
GOOGLE_ACCESS_TOKEN, all HTTP behind an injectable FetchFn:
list_messages (labelIds comma-joined), get_message, list_threads,
get_thread, list_labels, send_message (RFC822 built and
base64url-encoded as {raw}), create_draft ({message:{raw}}),
modify_message, trash_message, create_label.

Omitted groups (fixture `_source` lists them): label update/delete,
draft get/update/delete/send, message delete/batchModify, history,
profile/settings/watch, attachments download.

Ground truth: CORE-SUBSET, docs-derived from the public Gmail API
documentation. Fixture:
harness/fixtures/gmail-tools-original.json (labelled core-subset;
parity is vs the subset only).

## Verified (foreground, from disk)
- Tools: 10/10 — parity.json identical_tools = 10 = total.
- Unit tests: 14/14 pass (fake FetchFn; missing-token error, Bearer
  header, URL/method/body shaping for every tool, comma-joined
  labelIds, base64url raw decoding to the RFC822 headers + body for
  both send and draft, modify provided-fields shaping, upstream error
  surfacing).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Missing-env stdio check: tools/call list_messages with
  GOOGLE_ACCESS_TOKEN unset returned isError
  "GOOGLE_ACCESS_TOKEN environment variable is required".
- server.json description 84 chars (≤100); OCI entry has no version
  field; Dockerfile label io.github.CloudCorpRecords/mailport;
  full 19-file factory set present.

## Honest gaps
- No live Gmail call was made — request/response behaviour is
  fake-fetch proven only. No private Gmail data or connectors touched.
- send_message / create_draft build plain-text RFC822 only (no HTML
  alternative parts, no attachments, no threading headers).
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
