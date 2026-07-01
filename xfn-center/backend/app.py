from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from backend.atlassian_mcp_client import AtlassianMcpClient
from backend.routes.boards import boards_bp
from backend.config import get_settings
from backend.jira_client import JiraClient
from backend.routes.teams import teams_bp


def create_app() -> Flask:
    settings = get_settings()
    app = Flask(__name__)
    CORS(app)

    app.config["settings"] = settings
    app.config["jira_client"] = JiraClient(settings)
    app.config["atlassian_mcp_client"] = AtlassianMcpClient(settings)

    app.register_blueprint(boards_bp)
    app.register_blueprint(teams_bp)

    @app.get("/api/health")
    def healthcheck():
        return jsonify({"ok": True, "defaultProject": settings.jira_default_project, "dataSource": settings.jira_data_source})

    return app


app = create_app()


if __name__ == "__main__":
    settings = app.config["settings"]
    app.run(host=settings.app_host, port=settings.app_port, debug=settings.app_debug)
