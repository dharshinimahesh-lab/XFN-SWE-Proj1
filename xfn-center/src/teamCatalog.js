export const TEAM_FIELDS = [
  { key: "team", label: "Scrum Team", multiline: false },
  { key: "group", label: "Group", multiline: false },
  { key: "pmOwner", label: "PM Owner", multiline: false },
  { key: "tlOwner", label: "TL Owner", multiline: false },
  { key: "productGoalUrl", label: "Product Goal Jira Link", multiline: false },
  { key: "productGoal", label: "Product Goal", multiline: true },
  { key: "sprintGoal", label: "Sprint Goal", multiline: true },
  { key: "currentProgress", label: "Current Progress", multiline: true },
  { key: "upcomingWork", label: "Upcoming Work", multiline: true },
  { key: "impactsOrRisks", label: "Impacts or Risks", multiline: true },
  { key: "needsFromOtherTeams", label: "Needs from Other Teams", multiline: true },
];

export function createEmptyTeamData() {
  return {
    team: "",
    group: "",
    pmOwner: "",
    tlOwner: "",
    productGoalUrl: "",
    productGoal: "",
    sprintGoal: "",
    currentProgress: "",
    upcomingWork: "",
    impactsOrRisks: "",
    needsFromOtherTeams: "",
  };
}
