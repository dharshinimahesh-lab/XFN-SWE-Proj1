from __future__ import annotations

import base64
import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.config import Settings


class JiraClient:
    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.jira_base_url
        self._auth_header = self._build_auth_header(
            settings.jira_email,
            settings.jira_api_token,
        )

    @staticmethod
    def _build_auth_header(email: str, token: str) -> str:
        encoded = base64.b64encode(f"{email}:{token}".encode("utf-8")).decode("utf-8")
        return f"Basic {encoded}"

    def _request_json(self, path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urlencode(query, doseq=True)}"

        request = Request(url)
        request.add_header("Authorization", self._auth_header)
        request.add_header("Accept", "application/json")

        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def get_projects(self) -> list[dict[str, Any]]:
        payload = self._request_json("/rest/api/3/project/search", {"maxResults": 100})
        return payload.get("values", [])

    def get_boards(self, *, max_results: int = 100) -> list[dict[str, Any]]:
        payload = self._request_json("/rest/agile/1.0/board", {"maxResults": max_results})
        return payload.get("values", [])

    def get_board_issues(
        self,
        *,
        board_id: int,
        fields: list[str],
        max_results: int = 100,
    ) -> dict[str, Any]:
        return self._request_json(
            f"/rest/agile/1.0/board/{board_id}/issue",
            {
                "maxResults": max_results,
                "fields": ",".join(fields),
            },
        )

    def get_board_sprints(
        self,
        *,
        board_id: int,
        state: str,
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        payload = self._request_json(
            f"/rest/agile/1.0/board/{board_id}/sprint",
            {
                "state": state,
                "maxResults": max_results,
            },
        )
        return payload.get("values", [])

    def get_board_sprint_issues(
        self,
        *,
        board_id: int,
        sprint_id: int,
        fields: list[str],
        max_results: int = 100,
    ) -> dict[str, Any]:
        return self._request_json(
            f"/rest/agile/1.0/board/{board_id}/sprint/{sprint_id}/issue",
            {
                "maxResults": max_results,
                "fields": ",".join(fields),
            },
        )

    def search_issues(
        self,
        *,
        jql: str,
        fields: list[str],
        max_results: int = 100,
    ) -> list[dict[str, Any]]:
        payload = self._request_json(
            "/rest/api/3/search/jql",
            {
                "jql": jql,
                "maxResults": max_results,
                "fields": ",".join(fields),
            },
        )
        return payload.get("issues", [])
