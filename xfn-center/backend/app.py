from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from backend.config import get_settings
from backend.jira_client import JiraClient
from backend.routes.dashboard import dashboard_bp
from backend.routes.issues import issues_bp
from backend.routes.sync import sync_bp
from backend.routes.teams import teams_bp


def create_app() -> Flask:
    settings = get_settings()
    app = Flask(__name__)
    CORS(app)

    app.config["settings"] = settings
    app.config["jira_client"] = JiraClient(settings)

    app.register_blueprint(teams_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(issues_bp)
    app.register_blueprint(sync_bp)

    @app.get("/api/health")
    def healthcheck():
        return jsonify({"ok": True, "defaultProject": settings.jira_default_project})

    return app


app = create_app()


if __name__ == "__main__":
    settings = app.config["settings"]
    app.run(host=settings.app_host, port=settings.app_port, debug=settings.app_debug)
