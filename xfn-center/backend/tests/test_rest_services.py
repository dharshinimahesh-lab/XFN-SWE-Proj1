from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.services import _normalize_child_issue, _normalize_epic


class RestServicesTest(unittest.TestCase):
    def test_child_issue_derives_sprint_cadence_from_rest_sprint_dates(self):
        normalized = _normalize_child_issue(
            {
                "key": "ALLI-200",
                "fields": {
                    "summary": "Complete current sprint work",
                    "status": {"name": "In Progress"},
                    "customfield_10014": "ALLI-100",
                    "customfield_10021": [
                        {
                            "id": 808,
                            "name": "2026.Insights 13",
                            "state": "active",
                            "boardId": 105,
                            "startDate": "2026-07-01T00:00:00.000Z",
                            "endDate": "2026-07-15T00:00:00.000Z",
                            "goal": "Make the sprint data visible",
                        }
                    ],
                },
            }
        )

        self.assertEqual(normalized["sprintId"], "808")
        self.assertEqual(normalized["sprintName"], "2026.Insights 13")
        self.assertEqual(normalized["sprintDurationDays"], 14)
        self.assertEqual(normalized["sprintCadenceLabel"], "2 week sprint")
        self.assertEqual(normalized["sprintGoal"], "Make the sprint data visible")

    def test_epic_extracts_project_manager_and_owner_when_jira_has_them(self):
        normalized = _normalize_epic(
            {
                "key": "ALLI-100",
                "fields": {
                    "summary": "Fill owner fields",
                    "status": {"name": "In Progress", "statusCategory": {"name": "In Progress"}},
                    "statusCategory": {"name": "In Progress"},
                    "assignee": {"displayName": "Delivery Assignee"},
                    "updated": "2026-07-01T12:00:00.000Z",
                    "components": [{"name": "Insights"}],
                    "customfield_10670": {"value": "Alli - Insights"},
                    "customfield_10370": {"value": "Insights"},
                    "customfield_10626": {"displayName": "Priya PM"},
                    "customfield_10701": {"displayName": "Taylor Owner"},
                },
            }
        )

        self.assertEqual(normalized["pmOwner"], "Priya PM")
        self.assertEqual(normalized["tlOwner"], "Taylor Owner")
        self.assertEqual(normalized["assignee"], "Delivery Assignee")


if __name__ == "__main__":
    unittest.main()
