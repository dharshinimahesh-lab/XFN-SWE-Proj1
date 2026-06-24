from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.services import build_issue_lookup_payload


issues_bp = Blueprint("issues", __name__)


@issues_bp.get("/api/issues")
def get_issues():
    keys_param = request.args.get("keys", "")
    issue_keys = [key.strip() for key in keys_param.split(",") if key.strip()]
    payload = build_issue_lookup_payload(current_app.config["jira_client"], issue_keys=issue_keys)
    return jsonify(payload)
