from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.services import build_dashboard_payload


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/api/dashboard")
def get_dashboard():
    settings = current_app.config["settings"]
    project_key = request.args.get("project", settings.jira_default_project).strip()
    sprint_name = request.args.get("sprint", "").strip() or None
    max_results = min(int(request.args.get("maxResults", "200")), 500)

    payload = build_dashboard_payload(
        current_app.config["jira_client"],
        project_key=project_key,
        sprint_name=sprint_name,
        max_results=max_results,
    )
    return jsonify(payload)
