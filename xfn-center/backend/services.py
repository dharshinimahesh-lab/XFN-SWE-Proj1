from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

from backend.jira_client import JiraClient

ALLI_PROJECT_KEY = "ALLI"
ALLI_PROJECT_NAME = "Alli AI & Software Engineering"

ALLI_BOARD_GROUPS = [
    {
        "key": "alli-actions",
        "name": "Alli - Actions",
        "source_board_names": [
            "Creative - AI Template Generator",
            "3rd Party Marketplace",
            "Alli Frontend Core",
        ],
    },
    {
        "key": "alli-data",
        "name": "Alli - Data",
        "source_board_names": [
            "Alli - Data Group",
            "Data Integrations",
            "Alli - Media and Scenario Planner",
            "Home Court",
        ],
    },
    {
        "key": "alli-insights",
        "name": "Alli - Insights",
        "source_board_names": [
            "Alli - Insights Group",
            "Business Insights",
            "Audience Planner",
        ],
    },
]

FIELDS = {
    "summary": "summary",
    "status": "status",
    "status_category": "statusCategory",
    "assignee": "assignee",
    "updated": "updated",
    "sprint": "customfield_10021",
    "accountable_group": "customfield_10622",
    "responsible_team": "customfield_10670",
    "responsible_team_alt": "customfield_10370",
    "goals": "customfield_10691",
    "risks": "customfield_10680",
    "project_health": "customfield_10625",
    "pm_update": "customfield_10627",
    "project_manager": "customfield_10626",
    "delivery_progress": "customfield_11028",
    "delivery_status": "customfield_11029",
    "project_status": "customfield_11859",
    "owner": "customfield_10701",
    "cross_functional_team": "customfield_10634",
    "team": "customfield_10038",
    "team_alt": "customfield_10001",
    "blocking_deliverable": "customfield_10663",
    "dependencies": "customfield_11616",
    "epic_link": "customfield_10014",
    "components": "components",
    "issuetype": "issuetype",
}

JIRA_BROWSE_BASE = "https://agencypmg.atlassian.net/browse"


def _normalize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        for key in ("displayName", "name", "value", "key"):
            if value.get(key):
                return value[key]
        return None
    if isinstance(value, list):
        values = [_normalize_value(item) for item in value]
        return [item for item in values if item not in (None, "")]
    return value


def _string_list(value: Any) -> list[str]:
    normalized = _normalize_value(value)
    if normalized is None:
        return []
    if isinstance(normalized, list):
        flattened: list[str] = []
        for item in normalized:
            if isinstance(item, str):
                flattened.extend(part.strip() for part in item.replace("\r", "\n").split("\n"))
        return [item for item in flattened if item]
    if isinstance(normalized, str):
        parts = [part.strip() for part in normalized.replace("\r", "\n").split("\n")]
        return [part for part in parts if part]
    return [str(normalized)]


def _first_text(*values: Any, fallback: str = "") -> str:
    for value in values:
        normalized = _normalize_value(value)
        if isinstance(normalized, list):
            if normalized:
                return str(normalized[0])
        elif normalized not in (None, ""):
            return str(normalized)
    return fallback


def _is_done(fields: dict[str, Any]) -> bool:
    category = _normalize_value(fields.get(FIELDS["status_category"]))
    status = _normalize_value(fields.get(FIELDS["status"]))
    return str(category).lower() == "done" or str(status).lower() in {"done", "completed", "closed", "resolved"}


def _health_label(fields: dict[str, Any], has_risks: bool, is_done: bool) -> str:
    explicit = _first_text(
        fields.get(FIELDS["project_health"]),
        fields.get(FIELDS["project_status"]),
        fields.get(FIELDS["delivery_status"]),
        fallback="",
    )
    if explicit:
        return explicit
    if is_done:
        return "Done"
    if has_risks:
        return "At Risk"
    return "On Track"


def _normalize_components(value: Any) -> list[str]:
    if not value:
        return []
    names: list[str] = []
    for component in value:
        if isinstance(component, dict) and component.get("name"):
            names.append(component["name"])
    return names


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

    start_date = sprint.get("startDate") or sprint.get("start") or ""
    end_date = sprint.get("endDate") or sprint.get("end") or ""
    duration_days = _sprint_duration_days(start_date, end_date)
    board_id = sprint.get("boardId") or sprint.get("rapidViewId") or sprint.get("originBoardId")
    sprint_id = sprint.get("id") or sprint.get("sprintId")
    return {
        "id": str(sprint_id) if sprint_id not in (None, "") else "",
        "name": str(sprint.get("name") or sprint.get("sprintName") or ""),
        "state": str(sprint.get("state") or ""),
        "boardId": board_id,
        "startDate": str(start_date),
        "endDate": str(end_date),
        "completeDate": str(sprint.get("completeDate") or ""),
        "goal": str(sprint.get("goal") or ""),
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


def _sprint_meta(sprint: Any) -> dict[str, Any]:
    normalized = _normalize_sprint(sprint)
    return {
        "sprintId": normalized.get("id", "") if normalized else "",
        "sprintName": normalized.get("name", "") if normalized else "",
        "sprintState": normalized.get("state", "") if normalized else "",
        "sprintGoal": normalized.get("goal", "") if normalized else "",
        "sprintStartDate": normalized.get("startDate", "") if normalized else "",
        "sprintEndDate": normalized.get("endDate", "") if normalized else "",
        "sprintCompleteDate": normalized.get("completeDate", "") if normalized else "",
        "sprintDurationDays": normalized.get("durationDays") if normalized else None,
        "sprintCadenceLabel": normalized.get("cadenceLabel", "") if normalized else "",
    }


def _get_alli_boards(client: JiraClient) -> list[dict[str, Any]]:
    return [
        board
        for board in client.get_boards(max_results=100)
        if board.get("location", {}).get("projectKey") == ALLI_PROJECT_KEY
    ]


def _board_group_spec(board_key: str) -> dict[str, Any] | None:
    return next((group for group in ALLI_BOARD_GROUPS if group["key"] == board_key), None)


def _latest_or_active_sprint(client: JiraClient, *, board_id: int) -> dict[str, Any] | None:
    try:
        active = client.get_board_sprints(board_id=board_id, state="active", max_results=20)
    except Exception:
        return None
    if active:
        active.sort(key=lambda sprint: sprint.get("startDate") or sprint.get("id", 0), reverse=True)
        return active[0]

    try:
        closed = client.get_board_sprints(board_id=board_id, state="closed", max_results=100)
    except Exception:
        return None
    closed = [sprint for sprint in closed if sprint.get("endDate")]
    closed.sort(key=lambda sprint: sprint.get("endDate") or "", reverse=True)
    return closed[0] if closed else None


def _normalize_child_issue(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    recent_sprint = _select_relevant_sprint(fields.get(FIELDS["sprint"]))
    sprint_meta = _sprint_meta(recent_sprint)
    return {
        "issueKey": issue.get("key"),
        "issueUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "summary": fields.get(FIELDS["summary"], ""),
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "components": _normalize_components(fields.get(FIELDS["components"])),
        "epicKey": fields.get(FIELDS["epic_link"]),
        "sprintBoardId": recent_sprint.get("boardId") if recent_sprint else None,
        **sprint_meta,
    }


def _normalize_epic(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    risks = _string_list(fields.get(FIELDS["risks"]))
    dependencies = _string_list(fields.get(FIELDS["dependencies"]))
    blockers = _string_list(fields.get(FIELDS["blocking_deliverable"]))
    needs = [*dependencies, *blockers]
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
        "needsFromOtherTeams": needs,
        "health": _health_label(fields, bool(risks), _is_done(fields)),
    }


def _format_child_issue_summaries(children: list[dict[str, Any]]) -> str:
    if not children:
        return ""
    summaries = [f"{child['issueKey']}: {child['summary']} ({child['status']})" for child in children[:5]]
    return "\n".join(summaries)


def _issue_fields_for_sprint() -> list[str]:
    return [
        FIELDS["summary"],
        FIELDS["status"],
        FIELDS["assignee"],
        FIELDS["sprint"],
        FIELDS["epic_link"],
        FIELDS["components"],
        FIELDS["responsible_team"],
        FIELDS["responsible_team_alt"],
        FIELDS["accountable_group"],
        FIELDS["issuetype"],
    ]


def _group_slug(group_name: str) -> str:
    return group_name.lower().replace("alli - ", "").strip()


def _epic_matches_group(epic: dict[str, Any], group: dict[str, Any]) -> bool:
    target = _group_slug(group["name"])
    epic_group = (epic.get("group") or "").lower().strip()
    return target in epic_group


def _escaped_key_csv(issue_keys: list[str]) -> str:
    return ",".join(f'"{key.replace(chr(34), chr(92) + chr(34))}"' for key in issue_keys)


def _issue_fields_for_epics() -> list[str]:
    return [
        FIELDS["summary"],
        FIELDS["status"],
        FIELDS["status_category"],
        FIELDS["assignee"],
        FIELDS["updated"],
        FIELDS["components"],
        FIELDS["responsible_team"],
        FIELDS["responsible_team_alt"],
        FIELDS["accountable_group"],
        FIELDS["risks"],
        FIELDS["dependencies"],
        FIELDS["blocking_deliverable"],
        FIELDS["project_manager"],
        FIELDS["owner"],
        FIELDS["pm_update"],
        FIELDS["delivery_progress"],
        FIELDS["delivery_status"],
        FIELDS["project_status"],
    ]


def build_boards_payload(client: JiraClient) -> dict[str, Any]:
    alli_boards = _get_alli_boards(client)
    alli_by_name = {board["name"]: board for board in alli_boards}

    values = []
    for group in ALLI_BOARD_GROUPS:
        source_boards = []
        for name in group["source_board_names"]:
            board = alli_by_name.get(name)
            if board:
                source_boards.append(
                    {
                        "id": board["id"],
                        "name": board["name"],
                        "type": board.get("type", ""),
                    }
                )

        values.append(
            {
                "id": group["key"],
                "name": group["name"],
                "sourceBoards": source_boards,
            }
        )

    return {
        "boards": values,
        "spaceProjectKey": ALLI_PROJECT_KEY,
        "spaceProjectName": ALLI_PROJECT_NAME,
        "browseBaseUrl": JIRA_BROWSE_BASE,
    }


def build_board_payload(client: JiraClient, *, board_key: str, max_results: int = 200) -> dict[str, Any]:
    group = _board_group_spec(board_key)
    if group is None:
        raise ValueError(f"Board {board_key} is not in the {ALLI_PROJECT_NAME} space")

    alli_boards = _get_alli_boards(client)
    all_boards = client.get_boards(max_results=300)
    board_names_by_id = {board["id"]: board["name"] for board in all_boards}
    alli_by_name = {board["name"]: board for board in alli_boards}
    source_boards = [alli_by_name[name] for name in group["source_board_names"] if name in alli_by_name]
    if not source_boards:
        raise ValueError(f"No source boards were found for {group['name']}")

    epic_children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    epic_source_meta: dict[str, dict[str, Any]] = {}
    sprint_labels: list[str] = []

    for board in source_boards:
        sprint = _latest_or_active_sprint(client, board_id=board["id"])
        if sprint is not None:
            sprint_labels.append(f"{board['name']}: {sprint.get('name', 'Unknown Sprint')}")
        issue_payload = client.get_board_issues(
            board_id=board["id"],
            fields=_issue_fields_for_sprint(),
            max_results=max_results,
        )

        for issue in issue_payload.get("issues", []):
            child = _normalize_child_issue(issue)
            epic_key = child["epicKey"]
            issue_type = _first_text(issue.get("fields", {}).get(FIELDS["issuetype"]), fallback="")

            if epic_key:
                epic_children[epic_key].append(child)
                epic_source_meta.setdefault(
                    epic_key,
                    {
                        "sourceBoardName": board["name"],
                        **_sprint_meta(sprint),
                    },
                )
            elif issue_type == "Epic":
                epic_children[child["issueKey"]]
                epic_source_meta.setdefault(
                    child["issueKey"],
                    {
                        "sourceBoardName": board["name"],
                        **_sprint_meta(sprint),
                    },
                )

    candidate_epic_issues = client.search_issues(
        jql=f"project = {ALLI_PROJECT_KEY} AND issuetype = Epic ORDER BY updated DESC",
        fields=_issue_fields_for_epics(),
        max_results=500,
    )
    candidate_epics = [_normalize_epic(issue) for issue in candidate_epic_issues]

    for epic in candidate_epics:
        if not _epic_matches_group(epic, group) or epic["issueKey"] in epic_children:
            continue

        active_children = client.search_issues(
            jql=f'project = {ALLI_PROJECT_KEY} AND sprint in openSprints() AND "Epic Link" = {epic["issueKey"]} ORDER BY updated DESC',
            fields=_issue_fields_for_sprint(),
            max_results=100,
        )
        if not active_children:
            continue

        normalized_children = [_normalize_child_issue(issue) for issue in active_children]
        epic_children[epic["issueKey"]].extend(normalized_children)
        first_child = normalized_children[0]
        epic_source_meta.setdefault(
            epic["issueKey"],
            {
                "sourceBoardName": board_names_by_id.get(first_child["sprintBoardId"], "Cross-Functional Board"),
                "sprintName": first_child["sprintName"],
                "sprintState": first_child["sprintState"],
                "sprintGoal": first_child.get("sprintGoal", ""),
                "sprintId": first_child.get("sprintId", ""),
                "sprintStartDate": first_child.get("sprintStartDate", ""),
                "sprintEndDate": first_child.get("sprintEndDate", ""),
                "sprintCompleteDate": first_child.get("sprintCompleteDate", ""),
                "sprintDurationDays": first_child.get("sprintDurationDays"),
                "sprintCadenceLabel": first_child.get("sprintCadenceLabel", ""),
            },
        )

    epic_keys = list(epic_children.keys())
    if not epic_keys:
        return {
            "boardId": group["key"],
            "boardName": group["name"],
            "spaceProjectKey": ALLI_PROJECT_KEY,
            "spaceProjectName": ALLI_PROJECT_NAME,
            "browseBaseUrl": JIRA_BROWSE_BASE,
            "teams": [],
            "metrics": [],
            "lastSync": None,
            "total": 0,
            "sprintLabel": "No current or recent sprint issues linked to epics",
        }

    epic_issues = client.search_issues(
        jql=f"key in ({_escaped_key_csv(epic_keys)}) ORDER BY updated DESC",
        fields=_issue_fields_for_epics(),
        max_results=len(epic_keys),
    )
    epics_by_key = {_normalize_epic(issue)["issueKey"]: _normalize_epic(issue) for issue in epic_issues}

    entries: list[dict[str, Any]] = []
    for epic_key in epic_keys:
        epic = epics_by_key.get(epic_key)
        if epic is None:
            continue
        if not _epic_matches_group(epic, group):
            continue

        children = epic_children[epic_key]
        meta = epic_source_meta[epic_key]
        storage_key = f"{group['key']}::{epic_key}"
        entries.append(
            {
                "storageKey": storage_key,
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
                "sprintGoal": meta.get("sprintGoal", ""),
                "sprintId": meta.get("sprintId", ""),
                "sprintStartDate": meta.get("sprintStartDate", ""),
                "sprintEndDate": meta.get("sprintEndDate", ""),
                "sprintCompleteDate": meta.get("sprintCompleteDate", ""),
                "sprintDurationDays": meta.get("sprintDurationDays"),
                "sprintCadenceLabel": meta.get("sprintCadenceLabel", ""),
                "currentProgress": epic["currentProgress"] or _format_child_issue_summaries(children),
                "upcomingWork": "",
                "impactsOrRisks": epic["impactsOrRisks"],
                "needsFromOtherTeams": epic["needsFromOtherTeams"],
                "health": epic["health"],
                "liveUpdatedAt": epic["updated"],
                "sourceBoardName": meta["sourceBoardName"],
                "sprintName": meta["sprintName"],
                "sprintState": meta["sprintState"],
                "children": children,
                "manual": False,
            }
        )

    unique_entries = {entry["storageKey"]: entry for entry in entries}
    entries = sorted(unique_entries.values(), key=lambda item: (item["sourceBoardName"], item["team"], item["productGoal"]))

    risk_entries = sum(1 for entry in entries if entry["impactsOrRisks"])
    needs_entries = sum(1 for entry in entries if entry["needsFromOtherTeams"])
    metrics = [
        {
            "label": "Epic Entries",
            "value": str(len(entries)),
            "sub": "loaded",
            "delta": group["name"],
            "tone": "blue",
            "icon": "Target",
        },
        {
            "label": "Unique Epics",
            "value": str(len(epic_keys)),
            "sub": "product goals",
            "delta": "Current or most recent sprint",
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

    last_sync = max((entry["liveUpdatedAt"] or "" for entry in entries), default=None)
    sprint_label = " | ".join(sprint_labels) if sprint_labels else "Current or most recent sprint"

    return {
        "boardId": group["key"],
        "boardName": group["name"],
        "spaceProjectKey": ALLI_PROJECT_KEY,
        "spaceProjectName": ALLI_PROJECT_NAME,
        "browseBaseUrl": JIRA_BROWSE_BASE,
        "teams": entries,
        "metrics": metrics,
        "lastSync": last_sync,
        "total": len(entries),
        "sprintLabel": sprint_label,
    }
