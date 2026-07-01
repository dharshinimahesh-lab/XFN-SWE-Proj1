from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

from backend.atlassian_mcp_client import AtlassianMcpClient
from backend.services import (
    ALLI_BOARD_GROUPS,
    ALLI_PROJECT_KEY,
    ALLI_PROJECT_NAME,
    FIELDS,
    JIRA_BROWSE_BASE,
    _board_group_spec,
    _epic_matches_group,
    _escaped_key_csv,
    _first_text,
    _format_child_issue_summaries,
    _health_label,
    _is_done,
    _issue_fields_for_epics,
    _issue_fields_for_sprint,
    _normalize_components,
    _normalize_epic,
    _string_list,
)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_sprint_string(value: str) -> dict[str, Any]:
    pairs = re.findall(r"(\w+)=([^,\]]*)", value)
    parsed = {key: item for key, item in pairs}
    if "rapidViewId" in parsed and "boardId" not in parsed:
        parsed["boardId"] = parsed["rapidViewId"]
    return parsed


def _normalize_sprint(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        sprint = dict(value)
    elif isinstance(value, str):
        sprint = _parse_sprint_string(value)
    else:
        return None

    sprint_id = sprint.get("id") or sprint.get("sprintId")
    name = sprint.get("name") or sprint.get("sprintName") or ""
    state = sprint.get("state") or ""
    board_id = sprint.get("boardId") or sprint.get("rapidViewId") or sprint.get("originBoardId")
    start_date = sprint.get("startDate") or sprint.get("start") or ""
    end_date = sprint.get("endDate") or sprint.get("end") or ""
    complete_date = sprint.get("completeDate") or ""
    goal = sprint.get("goal") or ""

    duration_days = _sprint_duration_days(start_date, end_date)
    return {
        "id": str(sprint_id) if sprint_id not in (None, "") else "",
        "name": str(name),
        "state": str(state),
        "boardId": str(board_id) if board_id not in (None, "") else "",
        "startDate": str(start_date),
        "endDate": str(end_date),
        "completeDate": str(complete_date),
        "goal": str(goal),
        "durationDays": duration_days,
        "cadenceLabel": _sprint_cadence_label(duration_days),
    }


def _sprint_duration_days(start_date: Any, end_date: Any) -> int | None:
    start = _parse_datetime(start_date)
    end = _parse_datetime(end_date)
    if not start or not end:
        return None
    seconds = (end - start).total_seconds()
    if seconds <= 0:
        return None
    return max(1, math.ceil(seconds / 86400))


def _sprint_cadence_label(duration_days: int | None) -> str:
    if duration_days is None:
        return ""
    if 6 <= duration_days <= 8:
        return "1 week sprint"
    if 13 <= duration_days <= 15:
        return "2 week sprint"
    return f"{duration_days} day sprint"


def _sprint_date_range(start_date: str, end_date: str) -> str:
    start = start_date[:10] if start_date else ""
    end = end_date[:10] if end_date else ""
    if start and end:
        return f"{start} to {end}"
    return start or end


def _select_relevant_sprint(sprint_values: Any) -> dict[str, Any] | None:
    if not isinstance(sprint_values, list):
        sprint_values = [sprint_values] if sprint_values else []
    normalized = [sprint for sprint in (_normalize_sprint(value) for value in sprint_values) if sprint]
    active = [sprint for sprint in normalized if sprint["state"].lower() == "active"]
    if active:
        active.sort(key=lambda sprint: sprint["startDate"] or sprint["id"], reverse=True)
        return active[0]
    if normalized:
        normalized.sort(key=lambda sprint: sprint["endDate"] or sprint["startDate"] or sprint["id"], reverse=True)
        return normalized[0]
    return None


def _source_board_name(source_board_id: str, sprint_name: str) -> str:
    if source_board_id:
        return f"Jira board {source_board_id}"
    if sprint_name:
        return "Jira sprint"
    return "Cross-Functional Board"


def _issue_type_name(issue: dict[str, Any]) -> str:
    return _first_text(issue.get("fields", {}).get(FIELDS["issuetype"]), fallback="")


def _normalize_mcp_child_issue(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    sprint = _select_relevant_sprint(fields.get(FIELDS["sprint"]))
    parent_key = _first_text(fields.get(FIELDS["epic_link"]), fields.get("parent"), fallback="")
    source_board_id = sprint.get("boardId", "") if sprint else ""
    sprint_name = sprint.get("name", "") if sprint else ""

    return {
        "issueKey": issue.get("key"),
        "issueUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "summary": fields.get(FIELDS["summary"], ""),
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "components": _normalize_components(fields.get(FIELDS["components"])),
        "epicKey": parent_key,
        "sprintId": sprint.get("id", "") if sprint else "",
        "sprintName": sprint_name,
        "sprintState": sprint.get("state", "") if sprint else "",
        "sprintBoardId": source_board_id,
        "sprintStartDate": sprint.get("startDate", "") if sprint else "",
        "sprintEndDate": sprint.get("endDate", "") if sprint else "",
        "sprintCompleteDate": sprint.get("completeDate", "") if sprint else "",
        "sprintDurationDays": sprint.get("durationDays") if sprint else None,
        "sprintCadenceLabel": sprint.get("cadenceLabel", "") if sprint else "",
        "sprintGoal": sprint.get("goal", "") if sprint else "",
        "sourceBoardId": source_board_id,
        "sourceBoardName": _source_board_name(source_board_id, sprint_name),
    }


def _normalize_mcp_epic(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    risks = _string_list(fields.get(FIELDS["risks"]))
    dependencies = _string_list(fields.get(FIELDS["dependencies"]))
    blockers = _string_list(fields.get(FIELDS["blocking_deliverable"]))
    components = _normalize_components(fields.get(FIELDS["components"]))

    return {
        "issueKey": issue.get("key"),
        "issueUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "productGoal": fields.get(FIELDS["summary"], ""),
        "productGoalUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "components": components,
        "scrumTeam": _first_text(
            fields.get(FIELDS["responsible_team_alt"]),
            fields.get(FIELDS["team_alt"]),
            fields.get(FIELDS["responsible_team"]),
            components[0] if components else "",
            fallback="Unscoped Team",
        ),
        "group": _first_text(
            fields.get(FIELDS["responsible_team"]),
            fields.get(FIELDS["responsible_team_alt"]),
            fields.get(FIELDS["accountable_group"]),
            fallback="",
        ),
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "assignee": _first_text(fields.get(FIELDS["assignee"]), fallback="Unassigned"),
        "pmOwner": _first_text(fields.get(FIELDS["project_manager"]), fallback=""),
        "tlOwner": _first_text(fields.get(FIELDS["owner"]), fallback=""),
        "updated": fields.get(FIELDS["updated"]),
        "currentProgress": _first_text(
            fields.get(FIELDS["delivery_progress"]),
            fields.get(FIELDS["pm_update"]),
            fallback="",
        ),
        "impactsOrRisks": risks,
        "needsFromOtherTeams": [*dependencies, *blockers],
        "health": _health_label(fields, bool(risks), _is_done(fields)),
    }


def _issue_fields_for_mcp_current_sprint() -> list[str]:
    return [
        *_issue_fields_for_sprint(),
        FIELDS["updated"],
        FIELDS["status_category"],
        "parent",
    ]


def _board_source_payload(group: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": name,
            "name": name,
            "type": "jira-mcp",
        }
        for name in group["source_board_names"]
    ]


def build_boards_payload_mcp(_: AtlassianMcpClient) -> dict[str, Any]:
    return {
        "boards": [
            {
                "id": group["key"],
                "name": group["name"],
                "sourceBoards": _board_source_payload(group),
            }
            for group in ALLI_BOARD_GROUPS
        ],
        "spaceProjectKey": ALLI_PROJECT_KEY,
        "spaceProjectName": ALLI_PROJECT_NAME,
        "browseBaseUrl": JIRA_BROWSE_BASE,
        "dataSource": "mcp",
    }


def _fetch_epics(client: AtlassianMcpClient, epic_keys: list[str]) -> dict[str, dict[str, Any]]:
    epics_by_key: dict[str, dict[str, Any]] = {}
    unique_keys = sorted(set(key for key in epic_keys if key))
    for index in range(0, len(unique_keys), 50):
        chunk = unique_keys[index : index + 50]
        issues = client.search_issues(
            jql=f"key in ({_escaped_key_csv(chunk)}) ORDER BY updated DESC",
            fields=_issue_fields_for_epics(),
            max_results=len(chunk),
        )
        for issue in issues:
            normalized = _normalize_mcp_epic(issue)
            if normalized["issueKey"]:
                epics_by_key[normalized["issueKey"]] = normalized
    return epics_by_key


def build_board_payload_mcp(client: AtlassianMcpClient, *, board_key: str, max_results: int = 200) -> dict[str, Any]:
    group = _board_group_spec(board_key)
    if group is None:
        raise ValueError(f"Board {board_key} is not in the {ALLI_PROJECT_NAME} space")

    sprint_issues = client.search_issues(
        jql=f"project = {ALLI_PROJECT_KEY} AND sprint in openSprints() ORDER BY updated DESC",
        fields=_issue_fields_for_mcp_current_sprint(),
        max_results=max_results,
    )

    bucketed_children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bucket_meta: dict[str, dict[str, Any]] = {}
    inline_epics: dict[str, dict[str, Any]] = {}

    for issue in sprint_issues:
        child = _normalize_mcp_child_issue(issue)
        issue_type = _issue_type_name(issue).lower()
        epic_key = child["epicKey"]
        if issue_type == "epic":
            epic_key = child["issueKey"]
            inline_epics[epic_key] = _normalize_epic(issue)
        if not epic_key:
            continue

        source_board_id = child["sourceBoardId"] or "unscoped-board"
        sprint_id = child["sprintId"] or child["sprintName"] or "open-sprint"
        bucket_key = f"{source_board_id}::{sprint_id}::{epic_key}"
        bucketed_children[bucket_key].append(child)
        bucket_meta.setdefault(
            bucket_key,
            {
                "epicKey": epic_key,
                "sourceBoardId": child["sourceBoardId"],
                "sourceBoardName": child["sourceBoardName"],
                "sprintId": child["sprintId"],
                "sprintName": child["sprintName"],
                "sprintState": child["sprintState"],
                "sprintGoal": child["sprintGoal"],
                "sprintStartDate": child["sprintStartDate"],
                "sprintEndDate": child["sprintEndDate"],
                "sprintCompleteDate": child["sprintCompleteDate"],
                "sprintDurationDays": child["sprintDurationDays"],
                "sprintCadenceLabel": child["sprintCadenceLabel"],
            },
        )

    if not bucketed_children:
        return {
            "boardId": group["key"],
            "boardName": group["name"],
            "spaceProjectKey": ALLI_PROJECT_KEY,
            "spaceProjectName": ALLI_PROJECT_NAME,
            "browseBaseUrl": JIRA_BROWSE_BASE,
            "sourceBoards": _board_source_payload(group),
            "teams": [],
            "metrics": [],
            "lastSync": None,
            "total": 0,
            "sprintLabel": "No current Jira MCP sprint issues linked to epics",
            "dataSource": "mcp",
        }

    epics_by_key = _fetch_epics(client, [meta["epicKey"] for meta in bucket_meta.values()])
    epics_by_key.update({key: value for key, value in inline_epics.items() if key not in epics_by_key})

    entries: list[dict[str, Any]] = []
    for bucket_key, children in bucketed_children.items():
        meta = bucket_meta[bucket_key]
        epic_key = meta["epicKey"]
        epic = epics_by_key.get(epic_key)
        if not epic or not _epic_matches_group(epic, group):
            continue

        storage_key = f"{group['key']}::{meta['sourceBoardId'] or 'unscoped-board'}::{meta['sprintId'] or meta['sprintName'] or 'open-sprint'}::{epic_key}"
        legacy_storage_key = f"{group['key']}::{epic_key}"
        entries.append(
            {
                "storageKey": storage_key,
                "legacyStorageKey": legacy_storage_key,
                "issueKey": epic["issueKey"],
                "issueUrl": epic["issueUrl"],
                "productGoalUrl": epic["productGoalUrl"],
                "productGoal": epic["productGoal"],
                "team": epic["scrumTeam"],
                "group": epic["group"],
                "pmOwner": epic["pmOwner"],
                "tlOwner": epic["tlOwner"],
                "status": epic["status"],
                "assignee": epic["assignee"],
                "sprintId": meta["sprintId"],
                "sprintGoal": meta["sprintGoal"],
                "sprintStartDate": meta["sprintStartDate"],
                "sprintEndDate": meta["sprintEndDate"],
                "sprintCompleteDate": meta["sprintCompleteDate"],
                "sprintDurationDays": meta["sprintDurationDays"],
                "sprintCadenceLabel": meta["sprintCadenceLabel"],
                "currentProgress": epic["currentProgress"] or _format_child_issue_summaries(children),
                "upcomingWork": "",
                "impactsOrRisks": epic["impactsOrRisks"],
                "needsFromOtherTeams": epic["needsFromOtherTeams"],
                "health": epic["health"],
                "liveUpdatedAt": epic["updated"],
                "sourceBoardId": meta["sourceBoardId"],
                "sourceBoardName": meta["sourceBoardName"],
                "sprintName": meta["sprintName"],
                "sprintState": meta["sprintState"],
                "children": children,
                "manual": False,
            }
        )

    entries = sorted(entries, key=lambda item: (item["sourceBoardName"], item["sprintName"], item["team"], item["productGoal"]))
    unique_epics = {entry["issueKey"] for entry in entries}
    risk_entries = sum(1 for entry in entries if entry["impactsOrRisks"])
    needs_entries = sum(1 for entry in entries if entry["needsFromOtherTeams"])
    sprint_labels = []
    seen_sprints = set()
    for entry in entries:
        label_parts = [entry["sourceBoardName"], entry["sprintName"]]
        date_range = _sprint_date_range(entry["sprintStartDate"], entry["sprintEndDate"])
        if date_range:
            label_parts.append(date_range)
        if entry["sprintCadenceLabel"]:
            label_parts.append(entry["sprintCadenceLabel"])
        label = ": ".join([label_parts[0], " - ".join(part for part in label_parts[1:] if part)])
        if label not in seen_sprints:
            seen_sprints.add(label)
            sprint_labels.append(label)

    metrics = [
        {
            "label": "MCP Entries",
            "value": str(len(entries)),
            "sub": "loaded",
            "delta": group["name"],
            "tone": "blue",
            "icon": "Target",
        },
        {
            "label": "Unique Epics",
            "value": str(len(unique_epics)),
            "sub": "product goals",
            "delta": "Current Jira MCP sprint scope",
            "tone": "green",
            "icon": "CheckCircle2",
        },
        {
            "label": "Risk Notes",
            "value": str(risk_entries),
            "sub": "entries",
            "delta": "Pulled from epic fields",
            "tone": "orange",
            "icon": "AlertTriangle",
        },
        {
            "label": "Needs Logged",
            "value": str(needs_entries),
            "sub": "entries",
            "delta": "Dependencies + blockers",
            "tone": "purple",
            "icon": "Users",
        },
    ]

    return {
        "boardId": group["key"],
        "boardName": group["name"],
        "spaceProjectKey": ALLI_PROJECT_KEY,
        "spaceProjectName": ALLI_PROJECT_NAME,
        "browseBaseUrl": JIRA_BROWSE_BASE,
        "sourceBoards": _board_source_payload(group),
        "teams": entries,
        "metrics": metrics,
        "lastSync": max((entry["liveUpdatedAt"] or "" for entry in entries), default=None),
        "total": len(entries),
        "sprintLabel": " | ".join(sprint_labels) if sprint_labels else "Current Jira MCP sprint scope",
        "dataSource": "mcp",
    }
