from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.services import build_dashboard_payload


sync_bp = Blueprint("sync", __name__)


@sync_bp.post("/api/sync")
def sync_dashboard():
    settings = current_app.config["settings"]
    body = request.get_json(silent=True) or {}
    project_key = str(body.get("project") or settings.jira_default_project).strip()
    sprint_name = str(body.get("sprint") or "").strip() or None

    payload = build_dashboard_payload(
        current_app.config["jira_client"],
        project_key=project_key,
        sprint_name=sprint_name,
    )
    return jsonify(payload)
