from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.services import build_board_payload, build_boards_payload
from backend.xfn_sync_report import build_xfn_sync_payload


boards_bp = Blueprint("boards", __name__)


@boards_bp.get("/api/boards")
def get_boards():
    return jsonify(build_boards_payload(current_app.config["jira_client"]))


@boards_bp.get("/api/board")
def get_board():
    board_id = request.args.get("boardId", "").strip()
    max_results = min(int(request.args.get("maxResults", "500")), 1000)
    try:
        payload = build_board_payload(
            current_app.config["jira_client"],
            board_key=board_id,
            max_results=max_results,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(payload)


@boards_bp.get("/api/xfn-sync")
def get_xfn_sync():
    return jsonify(build_xfn_sync_payload(current_app.config["jira_client"]))
