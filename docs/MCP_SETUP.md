# MCP client setup

Install dependencies first with `bun install --frozen-lockfile`.

For an MCP client, configure a local stdio server. Replace the executable and project paths with your own absolute paths:

```json
{
  "mcpServers": {
    "ecommerce-data": {
      "command": "/absolute/path/to/bun",
      "args": ["/absolute/path/to/ecommerce-investigation-agent/src/mcp-server.ts"]
    }
  }
}
```

Generic MCP configuration formats differ between clients. The object above illustrates the executable and argument contract, not a universal client settings schema. No API key is required by this simulated data service. A model-enabled client still needs its own model connection.

## CraftAgents workspace

Use the source slug `ecommerce-data` so that the bundled Skill can find its required source.

1. In an existing CraftAgents workspace, configure a local stdio MCP source using the executable and argument paths above. `integrations/craft-agents/source.config.example.json` is a template; replace both absolute paths and set creation/update metadata for your workspace.
2. Use `craft/guide.md` as the source guide and the source-scoped patterns from `integrations/craft-agents/permissions.example.json` if configuring files manually. Use the normal source validation/test flow.
3. Copy `craft/skills/ecommerce-investigation/` into the workspace's `skills/` directory. The Skill declares `requiredSources: [ecommerce-data]`.
4. Invoke the Skill from the client menu. The tested 0.11.4 frontend also understands `[skill:ecommerce-investigation]` before a question.
5. Ask it to investigate `CUP-BLUE-500`, query the raw sources, compare `investigate_sku`, and submit the complete structured report to `review_report`.

The previous local monorepo installer is intentionally not included: it depends on internal CraftAgents packages and a machine-specific configuration directory. This repository provides portable configuration templates instead and does not include or modify your desktop credentials.
