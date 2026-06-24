from __future__ import annotations

from typing import Any

from backend.jira_client import JiraClient


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
}


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


def _first_text(*values: Any, fallback: str = "Unassigned") -> str:
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


def _sprint_names(value: Any) -> list[str]:
    names: list[str] = []
    normalized = _normalize_value(value)
    if isinstance(normalized, list):
        for item in normalized:
            if item:
                names.append(str(item))
    elif normalized:
        names.append(str(normalized))
    return names


def normalize_issue(issue: dict[str, Any]) -> dict[str, Any]:
    fields = issue.get("fields", {})
    risks = _string_list(fields.get(FIELDS["risks"]))
    dependencies = _string_list(fields.get(FIELDS["dependencies"]))
    blockers = _string_list(fields.get(FIELDS["blocking_deliverable"]))
    needs = [*dependencies, *blockers]
    done = _is_done(fields)
    team_name = _first_text(
        fields.get(FIELDS["responsible_team_alt"]),
        fields.get(FIELDS["responsible_team"]),
        fields.get(FIELDS["cross_functional_team"]),
        fields.get(FIELDS["team"]),
        fields.get(FIELDS["team_alt"]),
        fallback="Unknown Team",
    )
    group_name = _first_text(fields.get(FIELDS["accountable_group"]), fallback="Unscoped")
    goal = _first_text(fields.get(FIELDS["goals"]), fields.get(FIELDS["summary"]), fallback="No summary")
    update = _first_text(fields.get(FIELDS["pm_update"]), fallback="")
    progress = _first_text(fields.get(FIELDS["delivery_progress"]), fallback="")
    health = _health_label(fields, bool(risks), done)
    sprints = _sprint_names(fields.get(FIELDS["sprint"]))

    return {
        "issueKey": issue.get("key"),
        "team": team_name,
        "group": group_name,
        "goal": goal,
        "met": done,
        "risks": risks,
        "needs": needs,
        "health": health,
        "status": _first_text(fields.get(FIELDS["status"]), fallback="Unknown"),
        "assignee": _first_text(fields.get(FIELDS["assignee"]), fallback="Unassigned"),
        "updated": fields.get(FIELDS["updated"]),
        "sprints": sprints,
        "details": {
            "pmUpdate": update,
            "progress": progress,
            "blockers": blockers,
            "dependencies": dependencies,
            "risks": risks,
        },
    }


def build_dashboard_payload(
    client: JiraClient,
    *,
    project_key: str,
    sprint_name: str | None = None,
    max_results: int = 200,
) -> dict[str, Any]:
    jql = f'project = "{project_key}"'
    if sprint_name:
        escaped = sprint_name.replace('"', '\\"')
        jql += f' AND sprint = "{escaped}"'
    jql += " ORDER BY updated DESC"

    issues = client.search_issues(
        jql=jql,
        fields=list(FIELDS.values()),
        max_results=max_results,
    )

    teams: list[dict[str, Any]] = []
    sprint_options: set[str] = set()

    for issue in issues:
        normalized = normalize_issue(issue)
        sprints = normalized["sprints"]
        sprint_options.update(sprints)
        teams.append(normalized)

    open_risks = sum(1 for team in teams if team["risks"])
    goals_met = sum(1 for team in teams if team["met"])
    unfulfilled_needs = sum(len(team["needs"]) for team in teams)

    metrics = [
        {
            "label": "Sprint Goals",
            "value": str(len(teams)),
            "sub": "issues",
            "delta": f"Project {project_key}",
            "tone": "blue",
            "icon": "Target",
        },
        {
            "label": "Goals Met",
            "value": f"{goals_met} / {len(teams)}",
            "sub": f"{round((goals_met / len(teams)) * 100) if teams else 0}%",
            "delta": "Based on Jira status",
            "tone": "green",
            "icon": "CheckCircle2",
        },
        {
            "label": "Open Risks",
            "value": str(open_risks),
            "sub": "flagged",
            "delta": "Issues with risk text",
            "tone": "orange",
            "icon": "AlertTriangle",
        },
        {
            "label": "Unfulfilled Needs",
            "value": str(unfulfilled_needs),
            "sub": "dependencies",
            "delta": "Dependencies + blockers",
            "tone": "purple",
            "icon": "Users",
        },
    ]

    return {
        "project": project_key,
        "jql": jql,
        "teams": teams,
        "metrics": metrics,
        "sprints": sorted(sprint_options),
        "lastSync": teams[0]["updated"] if teams else None,
    }


def build_issue_lookup_payload(client: JiraClient, *, issue_keys: list[str]) -> dict[str, Any]:
    cleaned_keys = [key.strip() for key in issue_keys if key and key.strip()]
    if not cleaned_keys:
        return {"issues": {}, "lastSync": None}

    escaped_keys = ",".join(f'"{key.replace(chr(34), chr(92) + chr(34))}"' for key in cleaned_keys)
    issues = client.search_issues(
        jql=f"key in ({escaped_keys}) ORDER BY updated DESC",
        fields=list(FIELDS.values()),
        max_results=len(cleaned_keys),
    )

    normalized = [normalize_issue(issue) for issue in issues]
    issues_by_key = {item["issueKey"]: item for item in normalized}
    last_sync = normalized[0]["updated"] if normalized else None
    return {"issues": issues_by_key, "lastSync": last_sync}
