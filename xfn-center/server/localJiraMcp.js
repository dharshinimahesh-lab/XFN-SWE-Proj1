import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "xfn-local-jira-mcp",
  version: "0.1.0",
});

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Add it to xfn-center/.env.`);
  }
  return value;
}

function baseUrl() {
  return requireEnv("JIRA_BASE_URL").replace(/\/$/, "");
}

function authHeaders() {
  const email = requireEnv("JIRA_EMAIL");
  const token = requireEnv("JIRA_API_TOKEN");
  const basic = Buffer.from(`${email}:${token}`).toString("base64");

  return {
    Accept: "application/json",
    Authorization: `Basic ${basic}`,
  };
}

async function atlassianFetch(pathname, options = {}) {
  const response = await fetch(`${baseUrl()}${pathname}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = body?.errorMessages?.join("; ") || body?.message || response.statusText;
    throw new Error(`Atlassian API ${response.status}: ${detail}`);
  }

  return body;
}

function jsonToolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function normalizeLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(parsed, 100));
}

server.registerTool(
  "jira_projects",
  {
    title: "List Jira Projects",
    description: "List Jira projects visible to the configured Jira account.",
    inputSchema: {
      query: z.string().optional(),
      maxResults: z.number().optional(),
    },
  },
  async ({ query, maxResults }) => {
    const params = new URLSearchParams({
      maxResults: String(normalizeLimit(maxResults || 50, 50)),
    });

    if (query) {
      params.set("query", query);
    }

    const payload = await atlassianFetch(`/rest/api/3/project/search?${params.toString()}`);
    return jsonToolResult(payload);
  },
);

server.registerTool(
  "jira_search",
  {
    title: "Search Jira Issues",
    description: "Search Jira Cloud issues with JQL and return raw Jira issue payloads.",
    inputSchema: {
      jql: z.string().optional(),
      maxResults: z.number().optional(),
      limit: z.number().optional(),
      fields: z.array(z.string()).optional(),
      nextPageToken: z.string().optional(),
    },
  },
  async ({ jql, maxResults, limit, fields, nextPageToken }) => {
    const body = {
      fields: fields?.length
        ? fields
        : (process.env.JIRA_MCP_FIELDS || "summary,status,priority,labels,components,description,updated")
            .split(",")
            .map((field) => field.trim())
            .filter(Boolean),
      fieldsByKeys: true,
      jql: jql || process.env.JIRA_MCP_JQL || "ORDER BY updated DESC",
      maxResults: normalizeLimit(maxResults || limit || process.env.JIRA_MCP_LIMIT, 50),
    };

    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const payload = await atlassianFetch("/rest/api/3/search/jql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return jsonToolResult(payload);
  },
);

server.registerTool(
  "jira_fields",
  {
    title: "List Jira Fields",
    description: "List Jira fields so the dashboard can map customfield IDs into XFN columns.",
    inputSchema: {
      query: z.string().optional(),
    },
  },
  async ({ query }) => {
    const fields = await atlassianFetch("/rest/api/3/field");
    const normalizedQuery = query?.toLowerCase();
    const filtered = normalizedQuery
      ? fields.filter((field) =>
          `${field.id} ${field.key || ""} ${field.name}`.toLowerCase().includes(normalizedQuery),
        )
      : fields;

    return jsonToolResult({
      fields: filtered.map((field) => ({
        id: field.id,
        key: field.key,
        name: field.name,
        custom: field.custom,
        schema: field.schema,
      })),
    });
  },
);

server.registerTool(
  "confluence_search",
  {
    title: "Search Confluence Pages",
    description: "Search Confluence Cloud content using CQL.",
    inputSchema: {
      query: z.string().optional(),
      cql: z.string().optional(),
      limit: z.number().optional(),
      cursor: z.string().optional(),
    },
  },
  async ({ query, cql, limit, cursor }) => {
    const params = new URLSearchParams({
      cql: cql || query || process.env.CONFLUENCE_MCP_QUERY || 'type = "page"',
      limit: String(normalizeLimit(limit || process.env.CONFLUENCE_MCP_LIMIT, 25)),
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const payload = await atlassianFetch(`/wiki/rest/api/search?${params.toString()}`);
    return jsonToolResult(payload);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
