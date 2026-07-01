from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH)


@dataclass(frozen=True)
class Settings:
    jira_base_url: str
    jira_email: str
    jira_api_token: str
    jira_default_project: str
    jira_data_source: str
    jira_mcp_url: str
    jira_mcp_auth_mode: str
    atlassian_cloud_id: str
    app_host: str
    app_port: int
    app_debug: bool


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_settings() -> Settings:
    jira_data_source = os.getenv("JIRA_DATA_SOURCE", "rest").strip().lower() or "rest"
    if jira_data_source not in {"rest", "mcp", "hybrid"}:
        raise RuntimeError("JIRA_DATA_SOURCE must be 'rest', 'mcp', or 'hybrid'")

    return Settings(
        jira_base_url=_required_env("JIRA_BASE_URL").rstrip("/"),
        jira_email=_required_env("JIRA_EMAIL"),
        jira_api_token=_required_env("JIRA_API_TOKEN"),
        jira_default_project=os.getenv("JIRA_DEFAULT_PROJECT", "ALLI").strip() or "ALLI",
        jira_data_source=jira_data_source,
        jira_mcp_url=os.getenv("JIRA_MCP_URL", "https://mcp.atlassian.com/v1/mcp").strip()
        or "https://mcp.atlassian.com/v1/mcp",
        jira_mcp_auth_mode=os.getenv("JIRA_MCP_AUTH_MODE", "basic").strip().lower() or "basic",
        atlassian_cloud_id=os.getenv("ATLASSIAN_CLOUD_ID", "").strip(),
        app_host=os.getenv("APP_HOST", "127.0.0.1").strip() or "127.0.0.1",
        app_port=int(os.getenv("APP_PORT", "5001")),
        app_debug=os.getenv("APP_DEBUG", "").lower() in {"1", "true", "yes", "on"},
    )
