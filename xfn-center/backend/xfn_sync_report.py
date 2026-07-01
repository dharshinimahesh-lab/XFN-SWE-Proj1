from __future__ import annotations

import json
from typing import Any

from backend.config import get_settings
from backend.atlassian_mcp_client import AtlassianMcpClient
from backend.mcp_services import build_board_payload_mcp
from backend.jira_client import JiraClient
from backend.services import build_board_payload


ALLI_BOARD_KEYS = ["alli-insights", "alli-actions", "alli-data"]


def _row_from_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "storageKey": entry.get("storageKey", ""),
        "legacyStorageKey": entry.get("legacyStorageKey", ""),
        "boardId": entry.get("boardId", ""),
        "boardName": entry.get("boardName", ""),
        "issueKey": entry.get("issueKey", ""),
        "issueUrl": entry.get("issueUrl", ""),
        "team": entry.get("team", ""),
        "sourceBoardId": entry.get("sourceBoardId", ""),
        "sourceBoardName": entry.get("sourceBoardName", ""),
        "scrumTeam": entry.get("team", ""),
        "group": entry.get("group", ""),
        "productGoalKey": entry.get("issueKey", ""),
        "productGoalTitle": entry.get("productGoal", ""),
        "productGoalUrl": entry.get("productGoalUrl") or entry.get("issueUrl") or "",
        "sprintGoal": entry.get("sprintGoal", ""),
        "status": entry.get("status", ""),
        "sourceBoard": entry.get("sourceBoardName", ""),
        "sprintId": entry.get("sprintId", ""),
        "sprintName": entry.get("sprintName", ""),
        "sprintState": entry.get("sprintState", ""),
        "sprintStartDate": entry.get("sprintStartDate", ""),
        "sprintEndDate": entry.get("sprintEndDate", ""),
        "sprintCompleteDate": entry.get("sprintCompleteDate", ""),
        "sprintDurationDays": entry.get("sprintDurationDays"),
        "sprintCadenceLabel": entry.get("sprintCadenceLabel", ""),
        "pmOwner": entry.get("pmOwner", ""),
        "tlOwner": entry.get("tlOwner", ""),
        "assignee": entry.get("assignee", ""),
        "health": entry.get("health", ""),
        "liveUpdatedAt": entry.get("liveUpdatedAt", ""),
        "currentProgress": entry.get("currentProgress", ""),
        "upcomingWork": entry.get("upcomingWork", ""),
        "impactsOrRisks": entry.get("impactsOrRisks", ""),
        "needsFromOtherTeams": entry.get("needsFromOtherTeams", ""),
        "children": entry.get("children", []),
    }


def build_xfn_sync_payload(client: JiraClient) -> dict[str, Any]:
    boards: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    last_sync = None

    for board_key in ALLI_BOARD_KEYS:
        payload = build_board_payload(client, board_key=board_key, max_results=500)
        boards.append(
            {
                "boardId": payload["boardId"],
                "boardName": payload["boardName"],
                "sprintLabel": payload.get("sprintLabel", ""),
                "totalEntries": payload.get("total", 0),
                "sourceBoards": payload.get("sourceBoards", []),
            }
        )
        for entry in payload.get("teams", []):
            rows.append(
                _row_from_entry(
                    {
                        **entry,
                        "boardId": payload["boardId"],
                        "boardName": payload["boardName"],
                    }
                )
            )
        board_last_sync = payload.get("lastSync")
        if board_last_sync and (last_sync is None or board_last_sync > last_sync):
            last_sync = board_last_sync

    rows.sort(key=lambda row: (row["group"], row["scrumTeam"], row["productGoalKey"]))
    return {
        "boards": boards,
        "rows": rows,
        "spaceProjectKey": "ALLI",
        "spaceProjectName": "Alli AI & Software Engineering",
        "lastSync": last_sync,
        "dataSource": "rest",
    }


def build_xfn_sync_payload_mcp(client: AtlassianMcpClient) -> dict[str, Any]:
    boards: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    last_sync = None

    for board_key in ALLI_BOARD_KEYS:
        payload = build_board_payload_mcp(client, board_key=board_key, max_results=500)
        boards.append(
            {
                "boardId": payload["boardId"],
                "boardName": payload["boardName"],
                "sprintLabel": payload.get("sprintLabel", ""),
                "totalEntries": payload.get("total", 0),
                "sourceBoards": payload.get("sourceBoards", []),
            }
        )
        for entry in payload.get("teams", []):
            rows.append(
                _row_from_entry(
                    {
                        **entry,
                        "boardId": payload["boardId"],
                        "boardName": payload["boardName"],
                    }
                )
            )
        board_last_sync = payload.get("lastSync")
        if board_last_sync and (last_sync is None or board_last_sync > last_sync):
            last_sync = board_last_sync

    rows.sort(key=lambda row: (row["group"], row["scrumTeam"], row["sourceBoardName"], row["sprintName"], row["productGoalKey"]))
    return {
        "boards": boards,
        "rows": rows,
        "spaceProjectKey": "ALLI",
        "spaceProjectName": "Alli AI & Software Engineering",
        "lastSync": last_sync,
        "dataSource": "mcp",
    }


if __name__ == "__main__":
    client = JiraClient(get_settings())
    print(json.dumps(build_xfn_sync_payload(client), indent=2))
