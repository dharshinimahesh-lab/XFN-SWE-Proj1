from __future__ import annotations

from collections import defaultdict
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
    "delivery_progress": "customfield_11028",
    "delivery_status": "customfield_11029",
    "project_status": "customfield_11859",
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
    sprint_values = fields.get(FIELDS["sprint"]) or []
    active_sprint = next((sprint for sprint in sprint_values if sprint.get("state") == "active"), None)
    recent_sprint = active_sprint or (sprint_values[-1] if sprint_values else None)
    return {
        "issueKey": issue.get("key"),
        "issueUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "summary": fields.get(FIELDS["summary"], ""),
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "components": _normalize_components(fields.get(FIELDS["components"])),
        "epicKey": fields.get(FIELDS["epic_link"]),
        "sprintName": recent_sprint.get("name", "") if recent_sprint else "",
        "sprintState": recent_sprint.get("state", "") if recent_sprint else "",
        "sprintBoardId": recent_sprint.get("boardId") if recent_sprint else None,
    }


def _normalize_epic(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    risks = _string_list(fields.get(FIELDS["risks"]))
    dependencies = _string_list(fields.get(FIELDS["dependencies"]))
    blockers = _string_list(fields.get(FIELDS["blocking_deliverable"]))
    needs = [*dependencies, *blockers]
    return {
        "issueKey": issue.get("key"),
        "issueUrl": f"{JIRA_BROWSE_BASE}/{issue.get('key')}",
        "productGoal": fields.get(FIELDS["summary"], ""),
        "components": _normalize_components(fields.get(FIELDS["components"])),
        "group": _first_text(
            fields.get(FIELDS["responsible_team"]),
            fields.get(FIELDS["responsible_team_alt"]),
            fields.get(FIELDS["accountable_group"]),
            fallback="Unscoped",
        ),
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "assignee": _first_text(fields.get(FIELDS["assignee"]), fallback="Unassigned"),
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
                        "sprintName": sprint.get("name", "") if sprint else "",
                        "sprintState": sprint.get("state", "") if sprint else "",
                    },
                )
            elif issue_type == "Epic":
                epic_children[child["issueKey"]]
                epic_source_meta.setdefault(
                    child["issueKey"],
                    {
                        "sourceBoardName": board["name"],
                        "sprintName": sprint.get("name", "") if sprint else "",
                        "sprintState": sprint.get("state", "") if sprint else "",
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
        component_names = epic["components"] or sorted(
            {
                component
                for child in children
                for component in child["components"]
                if component
            }
        )
        if not component_names:
            component_names = ["Unassigned Component"]

        for component_name in component_names:
            matching_children = [
                child
                for child in children
                if not child["components"] or component_name in child["components"]
            ]
            meta = epic_source_meta[epic_key]
            storage_key = f"{group['key']}::{epic_key}::{component_name}"
            entries.append(
                {
                    "storageKey": storage_key,
                    "issueKey": epic["issueKey"],
                    "issueUrl": epic["issueUrl"],
                    "productGoal": epic["productGoal"],
                    "team": component_name,
                    "group": epic["group"],
                    "status": epic["status"],
                    "assignee": epic["assignee"],
                    "currentProgress": epic["currentProgress"] or _format_child_issue_summaries(matching_children),
                    "upcomingWork": "",
                    "impactsOrRisks": epic["impactsOrRisks"],
                    "needsFromOtherTeams": epic["needsFromOtherTeams"],
                    "health": epic["health"],
                    "liveUpdatedAt": epic["updated"],
                    "sourceBoardName": meta["sourceBoardName"],
                    "sprintName": meta["sprintName"],
                    "sprintState": meta["sprintState"],
                    "children": matching_children,
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
