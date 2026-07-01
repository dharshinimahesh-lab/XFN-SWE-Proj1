from __future__ import annotations

from typing import Any

from backend.atlassian_mcp_client import AtlassianMcpClient


JIRA_MCP_TOOL_NAMES = {
    "searchJiraIssuesUsingJql",
    "jira_searchJiraIssuesUsingJql",
    "search_jira",
    "getJiraIssue",
    "jira_getJiraIssue",
}

TEAMWORK_GRAPH_TOOL_NAMES = {
    "getTeamworkGraphContext",
    "getTeamworkGraphObject",
}


def _mcp_enrichment_status(client: AtlassianMcpClient) -> dict[str, Any]:
    try:
        tool_names = sorted(client.list_tool_names())
    except Exception as error:
        return {
            "mcpStatus": "unavailable",
            "mcpWarning": f"MCP enrichment unavailable: {error}",
            "mcpTools": [],
        }

    available = set(tool_names)
    has_jira_tools = bool(available.intersection(JIRA_MCP_TOOL_NAMES))
    has_teamwork_graph = bool(available.intersection(TEAMWORK_GRAPH_TOOL_NAMES))

    if has_jira_tools:
        return {
            "mcpStatus": "available",
            "mcpWarning": "",
            "mcpTools": tool_names,
        }

    if has_teamwork_graph:
        return {
            "mcpStatus": "partial",
            "mcpWarning": "MCP connected with Teamwork Graph tools only; REST is serving structured Jira sprint data.",
            "mcpTools": tool_names,
        }

    return {
        "mcpStatus": "partial",
        "mcpWarning": "MCP connected, but Jira search/read tools are not available; REST is serving structured Jira sprint data.",
        "mcpTools": tool_names,
    }


def enrich_payload_with_mcp_status(payload: dict[str, Any], client: AtlassianMcpClient) -> dict[str, Any]:
    status = _mcp_enrichment_status(client)
    return {
        **payload,
        "dataSource": "hybrid",
        "baseDataSource": "rest",
        "enrichmentDataSource": "mcp",
        **status,
    }
