# mailport

Gmail messages, threads and labels as MCP tools, talking to the Gmail
API. mailport is a clean-room rebuild of the core surface of the Gmail
reference MCP server, under a new name: fresh code written from the
public Gmail API documentation, no copied branding.

## Tools (core subset, 10)

`list_messages`, `get_message`, `list_threads`, `get_thread`,
`list_labels`, `send_message`, `create_draft`, `modify_message`,
`trash_message`, `create_label`.

Label update/delete, draft get/update/delete/send, message delete and
batchModify, history, profile/settings/watch, and attachment downloads
from the wider Gmail surface are not in this subset.

## Setup

Set a Google OAuth access token:

```bash
export GOOGLE_ACCESS_TOKEN=ya29....
```

Optionally override the API base with `GMAIL_API_URL`
(default `https://gmail.googleapis.com/gmail/v1`). Without the token,
every tool call fails with an error naming the missing variable.

## CLI

```bash
npx @reneturcios/mailport list_messages '{"query":"in:inbox","max_results":5}'
npx @reneturcios/mailport mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "mailport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/mailport", "mcp"],
      "env": { "GOOGLE_ACCESS_TOKEN": "ya29...." }
    }
  }
}
```

## Docker

```bash
docker run -i -e GOOGLE_ACCESS_TOKEN ghcr.io/cloudcorprecords/mailport
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
