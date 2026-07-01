from __future__ import annotations

import asyncio
import base64
import json
import sys
from typing import Any
from urllib.parse import urlparse

from backend.config import Settings


class AtlassianMcpClient:
    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.jira_base_url
        self.mcp_url = settings.jira_mcp_url
        self.auth_mode = settings.jira_mcp_auth_mode
        self.email = settings.jira_email
        self.api_token = settings.jira_api_token
        self._cloud_id = settings.atlassian_cloud_id
        self._tool_names: set[str] | None = None

    def _authorization_header(self) -> str:
        if self.auth_mode == "bearer":
            return f"Bearer {self.api_token}"
        if self.auth_mode != "basic":
            raise RuntimeError("JIRA_MCP_AUTH_MODE must be either 'basic' or 'bearer'")

        encoded = base64.b64encode(f"{self.email}:{self.api_token}".encode("utf-8")).decode("utf-8")
        return f"Basic {encoded}"

    @staticmethod
    def _run(coro):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coro)
        raise RuntimeError("Atlassian MCP calls must run from a synchronous Flask request context")

    async def _session_request_async(self, action: str, tool_name: str | None = None, arguments: dict[str, Any] | None = None) -> Any:
        if sys.version_info < (3, 10):
            raise RuntimeError(
                "Jira MCP requires Python 3.10 or newer. Recreate xfn-center/.venv with Python 3.10+ before using JIRA_DATA_SOURCE=mcp."
            )

        try:
            import httpx
            from mcp import ClientSession
            from mcp.client.streamable_http import streamable_http_client
        except ModuleNotFoundError as error:
            raise RuntimeError("Install backend requirements before using Jira MCP: pip install -r backend/requirements.txt") from error

        headers = {"Authorization": self._authorization_header()}
        async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(30.0, read=300.0)) as http_client:
            async with streamable_http_client(self.mcp_url, http_client=http_client) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    if action == "list_tools":
                        return await session.list_tools()
                    if not tool_name:
                        raise RuntimeError("Missing Atlassian MCP tool name")
                    result = await session.call_tool(tool_name, arguments=arguments or {})

        if getattr(result, "isError", False):
            raise RuntimeError(self._tool_result_text(result) or f"Atlassian MCP tool failed: {tool_name}")

        return self._coerce_tool_result(result)

    def call_tool(self, tool_name: str, arguments: dict[str, Any] | None = None) -> Any:
        resolved_tool_name = self._resolve_tool_name(tool_name)
        return self._run(self._session_request_async("call_tool", resolved_tool_name, arguments))

    def list_tool_names(self) -> set[str]:
        if self._tool_names is not None:
            return self._tool_names

        tools = self._run(self._session_request_async("list_tools"))
        self._tool_names = {tool.name for tool in tools.tools}
        return self._tool_names

    def _resolve_tool_name(self, tool_name: str) -> str:
        tool_names = self.list_tool_names()
        if tool_name in tool_names:
            return tool_name

        aliases = {
            "getAccessibleAtlassianResources": ["atlassian_getAccessibleAtlassianResources"],
            "searchJiraIssuesUsingJql": ["jira_searchJiraIssuesUsingJql", "search_jira"],
            "getJiraIssue": ["jira_getJiraIssue"],
        }
        for alias in aliases.get(tool_name, []):
            if alias in tool_names:
                return alias

        if tool_name == "getAccessibleAtlassianResources":
            raise LookupError("Atlassian MCP resources tool is not available")

        available = ", ".join(sorted(tool_names)) or "none"
        raise RuntimeError(
            f"Atlassian MCP tool '{tool_name}' is not available. Available tools: {available}. "
            "Enable Jira read/search tools for this Rovo MCP connection or use a token with Jira MCP scopes."
        )

    def get_cloud_id(self) -> str:
        if self._cloud_id:
            return self._cloud_id

        base_host = urlparse(self.base_url).netloc or self.base_url.replace("https://", "").replace("http://", "")
        try:
            resources = self.call_tool("getAccessibleAtlassianResources", {})
        except LookupError:
            self._cloud_id = base_host
            return self._cloud_id

        resource_values = self._extract_list(resources, ("resources", "values", "sites"))

        for resource in resource_values:
            if not isinstance(resource, dict):
                continue
            urls = [
                str(resource.get("url") or ""),
                str(resource.get("siteUrl") or ""),
                str(resource.get("baseUrl") or ""),
                str(resource.get("name") or ""),
            ]
            if any(base_host and base_host in value for value in urls):
                self._cloud_id = str(resource.get("cloudId") or resource.get("id") or base_host)
                return self._cloud_id

        if resource_values and isinstance(resource_values[0], dict):
            first = resource_values[0]
            self._cloud_id = str(first.get("cloudId") or first.get("id") or base_host)
            return self._cloud_id

        self._cloud_id = base_host
        return self._cloud_id

    def search_issues(self, *, jql: str, fields: list[str], max_results: int = 100) -> list[dict[str, Any]]:
        payload = self.call_tool(
            "searchJiraIssuesUsingJql",
            {
                "cloudId": self.get_cloud_id(),
                "jql": jql,
                "fields": fields,
                "maxResults": max_results,
            },
        )
        return self._extract_issues(payload)

    def get_issue(self, *, issue_key: str, fields: list[str]) -> dict[str, Any] | None:
        payload = self.call_tool(
            "getJiraIssue",
            {
                "cloudId": self.get_cloud_id(),
                "issueIdOrKey": issue_key,
                "fields": fields,
            },
        )
        issues = self._extract_issues(payload)
        if issues:
            return issues[0]
        return payload if isinstance(payload, dict) and payload.get("key") else None

    @classmethod
    def _extract_issues(cls, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []

        for key in ("issues", "values", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

        if isinstance(payload.get("data"), dict):
            return cls._extract_issues(payload["data"])
        if payload.get("key"):
            return [payload]
        return []

    @staticmethod
    def _extract_list(payload: Any, keys: tuple[str, ...]) -> list[Any]:
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in keys:
                value = payload.get(key)
                if isinstance(value, list):
                    return value
        return []

    @classmethod
    def _coerce_tool_result(cls, result: Any) -> Any:
        structured = getattr(result, "structuredContent", None)
        if structured is None:
            structured = getattr(result, "structured_content", None)
        if structured is not None:
            return structured

        text = cls._tool_result_text(result)
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"text": text}

    @staticmethod
    def _tool_result_text(result: Any) -> str:
        parts: list[str] = []
        for item in getattr(result, "content", []) or []:
            text = getattr(item, "text", None)
            if text:
                parts.append(str(text))
        return "\n".join(parts).strip()
