import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const defaultIssueToolNames = [
  "jira_search",
  "jira_search_issues",
  "search_jira_issues",
  "jira_jql_search",
  "searchIssues",
];

const defaultConfluenceToolNames = [
  "confluence_search",
  "confluence_search_pages",
  "search_confluence",
  "searchConfluence",
];

function getConfiguredToolNames(envName, defaults) {
  return process.env[envName]
    ? process.env[envName].split(",").map((name) => name.trim()).filter(Boolean)
    : defaults;
}

function parseJsonEnv(name, fallback = {}) {
  if (!process.env[name]) {
    return fallback;
  }

  try {
    return JSON.parse(process.env[name]);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`, { cause: error });
  }
}

function getAuthHeaders() {
  const headers = {};

  if (process.env.JIRA_MCP_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.JIRA_MCP_BEARER_TOKEN}`;
  }

  if (process.env.JIRA_MCP_HEADERS) {
    Object.assign(headers, parseJsonEnv("JIRA_MCP_HEADERS"));
  }

  return headers;
}

function getMcpTransport() {
  const transportType = process.env.JIRA_MCP_TRANSPORT || "streamable-http";

  if (process.env.JIRA_MCP_COMMAND) {
    return new StdioClientTransport({
      command: process.env.JIRA_MCP_COMMAND,
      args: process.env.JIRA_MCP_ARGS ? JSON.parse(process.env.JIRA_MCP_ARGS) : [],
      env: {
        ...process.env,
        ...parseJsonEnv("JIRA_MCP_ENV", {}),
      },
    });
  }

  if (!process.env.JIRA_MCP_URL) {
    const error = new Error(
      "Jira MCP is not configured. Set JIRA_MCP_URL for a remote MCP server or JIRA_MCP_COMMAND for a local stdio MCP server.",
    );
    error.code = "MCP_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(process.env.JIRA_MCP_URL);
  const requestInit = { headers: getAuthHeaders() };

  if (transportType === "sse") {
    return new SSEClientTransport(url, { requestInit });
  }

  return new StreamableHTTPClientTransport(url, { requestInit });
}

async function withMcpClient(callback) {
  const client = new Client({
    name: "xfn-dashboard-sync",
    version: "0.1.0",
  });
  const transport = getMcpTransport();

  await client.connect(transport);

  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

function findTool(tools, preferredNames) {
  const names = new Set(preferredNames.map((name) => name.toLowerCase()));
  return tools.find((tool) => names.has(tool.name.toLowerCase()));
}

async function callFirstAvailableTool(client, preferredNames, args) {
  const { tools = [] } = await client.listTools();
  const tool = findTool(tools, preferredNames);

  if (!tool) {
    const available = tools.map((item) => item.name).join(", ") || "none";
    throw new Error(
      `No matching MCP tool found. Tried ${preferredNames.join(", ")}. Available tools: ${available}`,
    );
  }

  const result = await client.callTool({
    name: tool.name,
    arguments: args,
  });

  return {
    toolName: tool.name,
    payload: extractPayload(result),
  };
}

function extractPayload(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result.content)) {
    const parsed = result.content
      .map((part) => {
        if (part.type === "text") {
          return parseMaybeJson(part.text);
        }

        if ("json" in part) {
          return part.json;
        }

        return part;
      })
      .filter(Boolean);

    return parsed.length === 1 ? parsed[0] : parsed;
  }

  return result;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { text: trimmed };
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return { text: trimmed };
  }
}

function flattenItems(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap(flattenItems);
  }

  for (const key of ["issues", "results", "items", "data", "values", "pages"]) {
    if (Array.isArray(payload[key])) {
      return payload[key].flatMap(flattenItems);
    }
  }

  return [payload];
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function field(fields, envName, fallbackNames = []) {
  const configured = process.env[envName] ? [process.env[envName]] : [];
  const names = [...configured, ...fallbackNames];

  for (const name of names) {
    if (fields?.[name] !== undefined) {
      return fields[name];
    }
  }

  return undefined;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    if (value.type === "doc" && Array.isArray(value.content)) {
      return extractAtlassianDocText(value);
    }

    return firstValue(value.name, value.value, value.displayName, value.key, value.title, JSON.stringify(value));
  }

  return String(value);
}

function extractAtlassianDocText(node) {
  if (!node) {
    return "";
  }

  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(extractAtlassianDocText).filter(Boolean).join(" ");
  }

  if (node.type === "text") {
    return node.text || "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (Array.isArray(node.content)) {
    const separator = ["paragraph", "heading", "listItem"].includes(node.type) ? "\n" : " ";
    return node.content.map(extractAtlassianDocText).filter(Boolean).join(separator).trim();
  }

  return "";
}

function normalizeList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).map((item) => item.trim()).filter(Boolean);
  }

  return normalizeText(value)
    .split(/[\n;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = normalizeText(value).toLowerCase();
  return ["yes", "true", "done", "met", "complete", "completed"].includes(text);
}

function inferGroup(fields) {
  const labels = normalizeList(fields.labels);
  const text = `${labels.join(" ")} ${normalizeText(fields.components)} ${normalizeText(fields.summary)}`.toLowerCase();

  for (const group of ["Data", "Insights", "Actions", "Core", "Customer"]) {
    if (text.includes(group.toLowerCase())) {
      return group;
    }
  }

  return "Core";
}

function inferHealth(fields, risks, goalMet) {
  const status = normalizeText(fields.status).toLowerCase();
  const priority = normalizeText(fields.priority).toLowerCase();

  if (risks.length || priority.includes("high") || status.includes("block")) {
    return "At Risk";
  }

  if (goalMet || status.includes("done") || status.includes("complete")) {
    return "On Track";
  }

  return "Watching";
}

function inferRiskLevel(fields, risks, impacts) {
  const priority = normalizeText(fields.priority).toLowerCase();
  const riskText = `${risks.join(" ")} ${impacts.join(" ")}`.toLowerCase();

  if (priority.includes("highest") || priority.includes("high") || riskText.includes("blocker")) {
    return "High";
  }

  if (risks.length || impacts.length || priority.includes("medium")) {
    return "Medium";
  }

  return "Low";
}

function normalizeIssue(issue) {
  const fields = issue.fields || issue;
  const key = firstValue(issue.key, issue.issueKey, fields.key, issue.id);
  const risks = normalizeList(field(fields, "XFN_FIELD_RISKS", ["risks", "risk", "Risk", "Risks"]));
  const needs = normalizeList(field(fields, "XFN_FIELD_NEEDS", ["needs", "dependencies", "Needs"]));
  const impacts = normalizeList(field(fields, "XFN_FIELD_IMPACTS", ["impacts", "impact", "Impacts"]));
  const goalMet = normalizeBoolean(
    field(fields, "XFN_FIELD_GOAL_MET", ["goalMet", "goal_met", "met", "Met"]),
  );
  const health = normalizeText(field(fields, "XFN_FIELD_HEALTH", ["health", "Health"])) || inferHealth(fields, risks, goalMet);
  const riskLevel =
    normalizeText(field(fields, "XFN_FIELD_RISK_LEVEL", ["riskLevel", "risk_level", "Risk Level"])) ||
    inferRiskLevel(fields, risks, impacts);

  return {
    issueKey: normalizeText(key),
    jiraUrl: process.env.JIRA_BASE_URL && key ? `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${key}` : "",
    scrumTeam: normalizeText(
      field(fields, "XFN_FIELD_TEAM", ["scrumTeam", "scrum_team", "team", "Team", "component"]),
    ),
    alliGroup:
      normalizeText(field(fields, "XFN_FIELD_GROUP", ["alliGroup", "alli_group", "group", "Group"])) ||
      inferGroup(fields),
    sprintIteration:
      normalizeText(field(fields, "XFN_FIELD_SPRINT", ["sprintIteration", "sprint", "Sprint", "fixVersions"])) ||
      process.env.JIRA_MCP_DEFAULT_SPRINT ||
      "Current Sprint",
    productGoal: normalizeText(field(fields, "XFN_FIELD_PRODUCT_GOAL", ["productGoal", "product_goal"])),
    sprintGoal:
      normalizeText(field(fields, "XFN_FIELD_SPRINT_GOAL", ["sprintGoal", "sprint_goal"])) ||
      normalizeText(fields.summary),
    goalMet,
    confidence:
      normalizeText(field(fields, "XFN_FIELD_CONFIDENCE", ["confidence", "Confidence"])) || "Not Yet Known",
    health,
    riskLevel,
    risks,
    needs,
    impacts,
    progress:
      normalizeText(field(fields, "XFN_FIELD_PROGRESS", ["progress", "description", "Description"])) ||
      normalizeText(fields.summary),
    updatedAt: normalizeText(fields.updated) || new Date().toISOString(),
    rawJson: issue,
  };
}

function attachConfluenceLinks(rows, pages) {
  const normalizedPages = pages.map((page) => ({
    title: normalizeText(page.title || page.name),
    url: normalizeText(page.url || page.webUrl || page._links?.webui || page._links?.base),
  }));

  return rows.map((row) => {
    const page = normalizedPages.find((item) =>
      item.title.toLowerCase().includes(row.scrumTeam.toLowerCase()),
    );

    return {
      ...row,
      confluenceUrl: page?.url || row.confluenceUrl || "",
    };
  });
}

export async function syncFromMcp() {
  const issueToolNames = getConfiguredToolNames("JIRA_MCP_ISSUE_TOOL", defaultIssueToolNames);
  const confluenceToolNames = getConfiguredToolNames(
    "CONFLUENCE_MCP_SEARCH_TOOL",
    defaultConfluenceToolNames,
  );

  return withMcpClient(async (client) => {
    const issueArgs = {
      jql:
        process.env.JIRA_MCP_JQL ||
        "ORDER BY updated DESC",
      maxResults: Number(process.env.JIRA_MCP_LIMIT || 100),
      limit: Number(process.env.JIRA_MCP_LIMIT || 100),
      fields: process.env.JIRA_MCP_FIELDS
        ? process.env.JIRA_MCP_FIELDS.split(",").map((fieldName) => fieldName.trim())
        : undefined,
      ...parseJsonEnv("JIRA_MCP_ISSUE_ARGS", {}),
    };

    const issueResult = await callFirstAvailableTool(client, issueToolNames, issueArgs);
    const rawIssues = flattenItems(issueResult.payload);
    const rows = rawIssues.map(normalizeIssue).filter((row) => row.issueKey || row.sprintGoal);

    let pages = [];
    if (process.env.CONFLUENCE_MCP_QUERY) {
      const pageArgs = {
        query: process.env.CONFLUENCE_MCP_QUERY,
        limit: Number(process.env.CONFLUENCE_MCP_LIMIT || 25),
        ...parseJsonEnv("CONFLUENCE_MCP_ARGS", {}),
      };

      const pageResult = await callFirstAvailableTool(client, confluenceToolNames, pageArgs);
      pages = flattenItems(pageResult.payload);
    }

    return {
      rows: attachConfluenceLinks(rows, pages),
      issueCount: rows.length,
      pageCount: pages.length,
      issueToolName: issueResult.toolName,
    };
  });
}
