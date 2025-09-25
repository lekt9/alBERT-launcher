# Smithery MCP integration playbook

This project ships with first-class support for [Smithery](https://smithery.ai) Model Context Protocol (MCP) connectors so you can blend remote knowledge packs with local search context. Use this guide to wire up additional MCP servers, enable OAuth-backed connectors, or extend alBERT with custom agents.

## Quick start

1. Install the official SDK when building MCP-aware services:
   ```bash
   npm install @modelcontextprotocol/sdk
   ```
2. Spin up a server using the `McpServer` helper. This example exposes an addition tool and a templated greeting resource:
   ```ts
   import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   import { z } from "zod";

   const server = new McpServer({
     name: "my-agent-server",
     version: "1.0.0",
   });

   server.registerTool(
     "add",
     {
       title: "Addition Tool",
       description: "Add two numbers",
       inputSchema: { a: z.number(), b: z.number() },
     },
     async ({ a, b }) => ({
       content: [{ type: "text", text: String(a + b) }],
     }),
   );

   server.registerResource(
     "greeting",
     new ResourceTemplate("greeting://{name}", { list: undefined }),
     {
       title: "Greeting Resource",
       description: "Generate dynamic greetings",
     },
     async (uri, { name }) => ({
       contents: [{ uri: uri.href, text: `Hello, ${name}!` }],
     }),
   );

   const transport = new StdioServerTransport();
   await server.connect(transport);
   ```
3. Configure the connector inside **Settings → Smithery MCP** using either the public slug (e.g. `spotify`) or a manifest URL. Private connectors require a Smithery API key stored locally via `.env` or the settings panel—never commit credentials to the repository.

## OAuth-enabled connectors

Some MCP servers rely on OAuth to access user accounts. Rather than handling the flow manually, proxy the OAuth lifecycle through Smithery's SDK middleware:

```ts
import express from "express";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";

const app = express();

const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: "https://auth.external.com/oauth2/v1/authorize",
    tokenUrl: "https://auth.external.com/oauth2/v1/token",
    revocationUrl: "https://auth.external.com/oauth2/v1/revoke",
  },
  verifyAccessToken: async (token) => ({
    token,
    clientId: "123",
    scopes: ["openid", "email", "profile"],
  }),
  getClient: async (client_id) => ({
    client_id,
    redirect_uris: ["http://localhost:3000/callback"],
  }),
});

app.use(
  mcpAuthRouter({
    provider: proxyProvider,
    issuerUrl: new URL("http://auth.external.com"),
    baseUrl: new URL("http://mcp.example.com"),
    serviceDocumentationUrl: new URL("https://docs.example.com/"),
  }),
);
```

With the proxy in place, clients such as LibreChat can complete the full OAuth handshake and refresh cycle automatically:

```yaml
mcpServers:
  spotify:
    type: "streamable-http"
    initTimeout: 150000
    url: "https://mcp-spotify-oauth-example.account.workers.dev/mcp"
```

## Deploying via Streamable HTTP

For production use, prefer the `StreamableHTTPServerTransport` so each client session is isolated and resumable:

```ts
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports[sessionId] : undefined;

  if (!transport && !sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport!;
      },
    });

    transport.onclose = () => {
      if (transport?.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = new McpServer({ name: "my-server", version: "1.0.0" });
    await server.connect(transport);
  }

  if (!transport) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

## Security & secrets

- The repository includes `.env.example` but ignores `.env`. Store private Smithery API keys or OAuth client secrets locally.
- Consider running secret scanners such as [`gitleaks`](https://github.com/gitleaks/gitleaks) or GitHub's push protection before publishing forks.
- The renderer requests MCP content through Smithery's public endpoints. When you host private servers, keep them behind authenticated transports and rotate credentials regularly.

## Additional resources

- [Smithery docs](https://github.com/smithery-ai/docs)
- [Smithery MCP TypeScript SDK](https://github.com/smithery-ai/mcp-sdk)
- [Model Context Protocol specification](https://smithery.ai/mcp)

Contributions that extend MCP support—new transports, OAuth providers, or UI workflows—are welcome! Open an issue describing your connector so we can review ergonomics and security implications together.
