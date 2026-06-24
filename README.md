# XFN-SWE-Proj1

React dashboard for the AISWE GLP XFN sprint command center.

## Local setup

```bash
cd xfn-center
npm install
cp .env.example .env
npm run dev
```

The React app runs through Vite and the local API runs on `http://localhost:5174`.
SQLite data is stored at `xfn-center/data/xfn-dashboard.sqlite` by default.

## Jira/Confluence MCP sync

The dashboard sync button calls `POST /api/sync`. The backend connects to Jira or
Confluence through MCP, normalizes the returned issues/pages, upserts them into
SQLite, and returns updated dashboard rows.

Configure `.env` for either a remote MCP server:

```bash
JIRA_MCP_URL=https://your-mcp-server.example.com/mcp
JIRA_MCP_TRANSPORT=streamable-http
JIRA_MCP_BEARER_TOKEN=...
```

Or use the local stdio MCP server included in this repo:

```bash
JIRA_MCP_COMMAND=node
JIRA_MCP_ARGS=["server/localJiraMcp.js"]
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-local-api-token
```

Check that the local MCP server starts:

```bash
npm run mcp:check
```

List visible Jira projects:

```bash
npm run mcp:projects
```

After adding Jira credentials, discover custom fields:

```bash
npm run mcp:fields
```

Most internal Jira instances use custom fields, so map those field IDs in `.env`
using the `XFN_FIELD_*` variables. Example:

```bash
XFN_FIELD_TEAM=customfield_12345
XFN_FIELD_GROUP=customfield_12346
XFN_FIELD_SPRINT=customfield_12347
XFN_FIELD_SPRINT_GOAL=customfield_12348
XFN_FIELD_RISKS=customfield_12349
XFN_FIELD_NEEDS=customfield_12350
```
