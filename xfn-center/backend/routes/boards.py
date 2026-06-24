from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from backend.services import build_board_payload, build_boards_payload


boards_bp = Blueprint("boards", __name__)


@boards_bp.get("/api/boards")
def get_boards():
    return jsonify(build_boards_payload(current_app.config["jira_client"]))


@boards_bp.get("/api/board")
def get_board():
    board_id = int(request.args.get("boardId", "0"))
    max_results = min(int(request.args.get("maxResults", "200")), 500)
    try:
        payload = build_board_payload(
            current_app.config["jira_client"],
            board_id=board_id,
            max_results=max_results,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(payload)
