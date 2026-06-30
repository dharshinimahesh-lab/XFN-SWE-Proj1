export const TEAM_FIELDS = [
  { key: "issueKey", label: "Epic Key", multiline: false },
  { key: "team", label: "Team", multiline: false },
  { key: "group", label: "Group", multiline: false },
  { key: "status", label: "Status", multiline: false },
  { key: "assignee", label: "Assignee", multiline: false },
  { key: "productGoal", label: "Product Goal", multiline: true },
  { key: "currentProgress", label: "Current Progress", multiline: true },
  { key: "upcomingWork", label: "Upcoming Work", multiline: true },
  { key: "impactsOrRisks", label: "Impacts or Risks", multiline: true },
  { key: "needsFromOtherTeams", label: "Needs from Other Teams", multiline: true },
];

export function createEmptyTeamData() {
  return {
    issueKey: "",
    team: "",
    group: "",
    status: "",
    assignee: "",
    productGoal: "",
    currentProgress: "",
    upcomingWork: "",
    impactsOrRisks: "",
    needsFromOtherTeams: "",
  };
}
