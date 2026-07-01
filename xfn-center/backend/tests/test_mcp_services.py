from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.mcp_services import _normalize_mcp_child_issue, _normalize_mcp_epic, _normalize_sprint, build_board_payload_mcp


class FakeMcpClient:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail

    def search_issues(self, *, jql, fields, max_results=100):
        if self.fail:
            raise RuntimeError("MCP auth failed")

        if "sprint in openSprints()" in jql:
            return [
                self._child_issue(
                    key="ALLI-101",
                    board_id=11,
                    sprint_id=701,
                    sprint_name="Actions Sprint 1",
                    start_date="2026-06-01T00:00:00.000Z",
                    end_date="2026-06-08T00:00:00.000Z",
                ),
                self._child_issue(
                    key="ALLI-102",
                    board_id=12,
                    sprint_id=702,
                    sprint_name="Actions Sprint 2",
                    start_date="2026-06-01T00:00:00.000Z",
                    end_date="2026-06-15T00:00:00.000Z",
                ),
            ]

        if "key in" in jql:
            return [
                {
                    "key": "ALLI-1",
                    "fields": {
                        "summary": "Launch cross-functional workflow",
                        "status": {"name": "In Progress", "statusCategory": {"name": "In Progress"}},
                        "statusCategory": {"name": "In Progress"},
                        "assignee": {"displayName": "Pat Product"},
                        "updated": "2026-06-05T12:00:00.000Z",
                        "components": [{"name": "Actions Core"}],
                        "customfield_10670": {"value": "Alli - Actions"},
                        "customfield_10370": {"value": "Actions Core"},
                        "customfield_10680": ["API dependency"],
                        "customfield_11616": ["Needs data contract"],
                    },
                }
            ]

        return []

    @staticmethod
    def _child_issue(*, key, board_id, sprint_id, sprint_name, start_date, end_date):
        return {
            "key": key,
            "fields": {
                "summary": f"{key} child work",
                "status": {"name": "In Progress"},
                "customfield_10021": [
                    {
                        "id": sprint_id,
                        "name": sprint_name,
                        "state": "active",
                        "boardId": board_id,
                        "startDate": start_date,
                        "endDate": end_date,
                        "goal": "Ship the POC",
                    }
                ],
                "customfield_10014": "ALLI-1",
                "components": [{"name": "Actions Core"}],
                "issuetype": {"name": "Story"},
            },
        }


class McpServicesTest(unittest.TestCase):
    def test_same_epic_in_two_sprints_produces_two_cadence_rows(self):
        payload = build_board_payload_mcp(FakeMcpClient(), board_key="alli-actions", max_results=100)

        self.assertEqual(payload["dataSource"], "mcp")
        self.assertEqual(payload["total"], 2)
        self.assertEqual({entry["issueKey"] for entry in payload["teams"]}, {"ALLI-1"})
        self.assertEqual({entry["legacyStorageKey"] for entry in payload["teams"]}, {"alli-actions::ALLI-1"})
        self.assertEqual(len({entry["storageKey"] for entry in payload["teams"]}), 2)
        self.assertEqual({entry["sprintCadenceLabel"] for entry in payload["teams"]}, {"1 week sprint", "2 week sprint"})
        self.assertEqual({entry["sprintDurationDays"] for entry in payload["teams"]}, {7, 14})

    def test_mcp_tool_failure_is_not_silently_swallowed(self):
        with self.assertRaisesRegex(RuntimeError, "MCP auth failed"):
            build_board_payload_mcp(FakeMcpClient(fail=True), board_key="alli-actions", max_results=100)

    def test_legacy_jira_sprint_string_derives_two_week_cadence(self):
        sprint = _normalize_sprint(
            "com.atlassian.greenhopper.service.sprint.Sprint@abc["
            "id=930,rapidViewId=222,state=ACTIVE,name=2026.Actions 14,"
            "startDate=2026-07-01T00:00:00.000Z,endDate=2026-07-15T00:00:00.000Z,"
            "completeDate=<null>,goal=Ship the messy source"
            "]"
        )

        self.assertEqual(sprint["id"], "930")
        self.assertEqual(sprint["boardId"], "222")
        self.assertEqual(sprint["name"], "2026.Actions 14")
        self.assertEqual(sprint["durationDays"], 14)
        self.assertEqual(sprint["cadenceLabel"], "2 week sprint")

    def test_child_issue_normalizes_unstructured_sprint_string(self):
        issue = {
            "key": "ALLI-777",
            "fields": {
                "summary": "Ship data from an unstructured source",
                "status": {"name": "In Progress"},
                "customfield_10021": [
                    "com.atlassian.greenhopper.service.sprint.Sprint@abc["
                    "id=931,rapidViewId=223,state=ACTIVE,name=2026.Actions 15,"
                    "startDate=2026-07-01T00:00:00.000Z,endDate=2026-07-08T00:00:00.000Z,"
                    "goal=Normalize weird Jira strings"
                    "]"
                ],
                "customfield_10014": "ALLI-1",
                "components": [{"name": "Actions Core"}],
            },
        }

        normalized = _normalize_mcp_child_issue(issue)

        self.assertEqual(normalized["epicKey"], "ALLI-1")
        self.assertEqual(normalized["sourceBoardId"], "223")
        self.assertEqual(normalized["sourceBoardName"], "Jira board 223")
        self.assertEqual(normalized["sprintName"], "2026.Actions 15")
        self.assertEqual(normalized["sprintCadenceLabel"], "1 week sprint")
        self.assertEqual(normalized["sprintGoal"], "Normalize weird Jira strings")

    def test_epic_normalizes_multiline_risks_and_mixed_dependency_fields(self):
        issue = {
            "key": "ALLI-1",
            "fields": {
                "summary": "Coordinate work from unstructured updates",
                "status": {"name": "In Progress", "statusCategory": {"name": "In Progress"}},
                "statusCategory": {"name": "In Progress"},
                "assignee": {"displayName": "Pat Product"},
                "updated": "2026-07-01T12:00:00.000Z",
                "components": [{"name": "Actions Core"}],
                "customfield_10670": {"value": "Alli - Actions"},
                "customfield_10370": {"value": "Actions Core"},
                "customfield_10680": "Risk A\nRisk B\r\nRisk C",
                "customfield_11616": [{"value": "Needs Data Platform"}, "Needs QA\nNeeds Legal"],
                "customfield_10663": "Blocked by rollout owner\rBlocked by analytics",
                "customfield_11028": {"value": "In discovery"},
            },
        }

        normalized = _normalize_mcp_epic(issue)

        self.assertEqual(normalized["scrumTeam"], "Actions Core")
        self.assertEqual(normalized["group"], "Alli - Actions")
        self.assertEqual(normalized["currentProgress"], "In discovery")
        self.assertEqual(normalized["impactsOrRisks"], ["Risk A", "Risk B", "Risk C"])
        self.assertIn("Needs Data Platform", normalized["needsFromOtherTeams"])
        self.assertIn("Needs QA", normalized["needsFromOtherTeams"])
        self.assertIn("Needs Legal", normalized["needsFromOtherTeams"])
        self.assertIn("Blocked by rollout owner", normalized["needsFromOtherTeams"])
        self.assertIn("Blocked by analytics", normalized["needsFromOtherTeams"])


if __name__ == "__main__":
    unittest.main()
