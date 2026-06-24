import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const args = new Set(process.argv.slice(2));

const client = new Client({
  name: "xfn-local-jira-mcp-check",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["server/localJiraMcp.js"],
  env: process.env,
});

await client.connect(transport);

try {
  const { tools } = await client.listTools();
  console.log("Available MCP tools:");
  for (const tool of tools) {
    console.log(`- ${tool.name}: ${tool.description || tool.title || ""}`);
  }

  if (args.has("--fields")) {
    const result = await client.callTool({
      name: "jira_fields",
      arguments: {
        query: process.env.MCP_FIELD_QUERY || "",
      },
    });
    console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
  }

  if (args.has("--projects")) {
    const result = await client.callTool({
      name: "jira_projects",
      arguments: {
        query: process.env.MCP_PROJECT_QUERY || "",
        maxResults: 50,
      },
    });
    console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
  }

  if (args.has("--search")) {
    const result = await client.callTool({
      name: "jira_search",
      arguments: {
        jql: process.env.JIRA_MCP_JQL || "ORDER BY updated DESC",
        maxResults: 3,
      },
    });
    console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
  }
} finally {
  await client.close();
}
