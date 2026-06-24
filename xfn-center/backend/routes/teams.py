from __future__ import annotations

from flask import Blueprint, current_app, jsonify


teams_bp = Blueprint("teams", __name__)


@teams_bp.get("/api/projects")
def get_projects():
    settings = current_app.config["settings"]
    projects = current_app.config["jira_client"].get_projects()
    values = [
        {"key": project["key"], "name": project["name"]}
        for project in projects
        if project.get("projectTypeKey") in {"software", "business"}
    ]
    return jsonify({"projects": values, "defaultProject": settings.jira_default_project})
