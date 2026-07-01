from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.hybrid_services import enrich_payload_with_mcp_status
from backend.mcp_services import build_board_payload_mcp, build_boards_payload_mcp
from backend.services import build_board_payload, build_boards_payload
from backend.xfn_sync_report import build_xfn_sync_payload, build_xfn_sync_payload_mcp


boards_bp = Blueprint("boards", __name__)


@boards_bp.get("/api/boards")
def get_boards():
    settings = current_app.config["settings"]
    try:
        if settings.jira_data_source == "mcp":
            return jsonify(build_boards_payload_mcp(current_app.config["atlassian_mcp_client"]))
        payload = build_boards_payload(current_app.config["jira_client"])
        if settings.jira_data_source == "hybrid":
            payload = enrich_payload_with_mcp_status(payload, current_app.config["atlassian_mcp_client"])
        return jsonify(payload)
    except Exception as error:
        return jsonify({"error": str(error), "dataSource": settings.jira_data_source}), 502


@boards_bp.get("/api/board")
def get_board():
    settings = current_app.config["settings"]
    board_id = request.args.get("boardId", "").strip()
    max_results = min(int(request.args.get("maxResults", "500")), 1000)
    try:
        if settings.jira_data_source == "mcp":
            payload = build_board_payload_mcp(
                current_app.config["atlassian_mcp_client"],
                board_key=board_id,
                max_results=max_results,
            )
        else:
            payload = build_board_payload(
                current_app.config["jira_client"],
                board_key=board_id,
                max_results=max_results,
            )
            if settings.jira_data_source == "hybrid":
                payload = enrich_payload_with_mcp_status(payload, current_app.config["atlassian_mcp_client"])
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": str(error), "dataSource": settings.jira_data_source}), 502
    return jsonify(payload)


@boards_bp.get("/api/xfn-sync")
def get_xfn_sync():
    settings = current_app.config["settings"]
    try:
        if settings.jira_data_source == "mcp":
            return jsonify(build_xfn_sync_payload_mcp(current_app.config["atlassian_mcp_client"]))
        payload = build_xfn_sync_payload(current_app.config["jira_client"])
        if settings.jira_data_source == "hybrid":
            payload = enrich_payload_with_mcp_status(payload, current_app.config["atlassian_mcp_client"])
        return jsonify(payload)
    except Exception as error:
        return jsonify({"error": str(error), "dataSource": settings.jira_data_source}), 502
