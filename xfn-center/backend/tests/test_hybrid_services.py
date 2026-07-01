from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.hybrid_services import enrich_payload_with_mcp_status


class FakeMcpClient:
    def __init__(self, tool_names):
        self.tool_names = set(tool_names)

    def list_tool_names(self):
        return self.tool_names


class HybridServicesTest(unittest.TestCase):
    def test_teamwork_graph_only_mcp_is_partial_and_keeps_rest_payload(self):
        payload = {"dataSource": "rest", "rows": [{"issueKey": "ALLI-1"}]}
        enriched = enrich_payload_with_mcp_status(
            payload,
            FakeMcpClient(["getTeamworkGraphContext", "getTeamworkGraphObject"]),
        )

        self.assertEqual(enriched["dataSource"], "hybrid")
        self.assertEqual(enriched["baseDataSource"], "rest")
        self.assertEqual(enriched["enrichmentDataSource"], "mcp")
        self.assertEqual(enriched["mcpStatus"], "partial")
        self.assertEqual(enriched["rows"], payload["rows"])
        self.assertIn("REST is serving structured Jira sprint data", enriched["mcpWarning"])

    def test_jira_mcp_tools_mark_enrichment_available(self):
        enriched = enrich_payload_with_mcp_status(
            {"dataSource": "rest"},
            FakeMcpClient(["searchJiraIssuesUsingJql", "getJiraIssue"]),
        )

        self.assertEqual(enriched["dataSource"], "hybrid")
        self.assertEqual(enriched["mcpStatus"], "available")
        self.assertEqual(enriched["mcpWarning"], "")


if __name__ == "__main__":
    unittest.main()
