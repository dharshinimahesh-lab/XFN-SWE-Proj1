export const SPRINT_LABEL = "2026-06-08";

export const TEAM_CATALOG = [
  { team: "Velocity", group: "Insights", issueKey: "ALLI-25537" },
  { team: "Business Insights", group: "Insights", issueKey: "ALLI-25411" },
  { team: "Creative Insights", group: "Insights", issueKey: "ALLI-24550" },
  { team: "Audience Planner", group: "Insights", issueKey: "" },
  { team: "Creative Studio - Template Generator", group: "Actions", issueKey: "Leviathan-100" },
  { team: "Creative Studio - Editing & Delivery", group: "Actions", issueKey: "Balrog-200" },
  { team: "GenWorkflows", group: "Actions", issueKey: "ALLI-19686" },
  { team: "Workflows Platform", group: "Actions", issueKey: "ALLI-21675" },
  { team: "Workflows Templates", group: "Actions", issueKey: "ALLI-21690" },
  { team: "Marketplace", group: "Actions", issueKey: "ALLI-24562" },
  { team: "Data Explorer (+UDA)", group: "Data", issueKey: "ALLI-21415" },
  { team: "Media/Scenario Planner", group: "Data", issueKey: "ALLI-24077" },
  { team: "Generative Dashboards", group: "Data", issueKey: "" },
  { team: "Agentic Homecourt", group: "Data", issueKey: "ALLI-23300" },
  { team: "Categorizations", group: "Data", issueKey: "ALLI-19175" },
  { team: "Data Library", group: "Data", issueKey: "" },
  { team: "Semantic Layer", group: "Data", issueKey: "" },
  { team: "Core (Platforms/MCPs/360)", group: "Core", issueKey: "" },
  { team: "Data Science", group: "Data Science", issueKey: "" },
];

export const TEAM_FIELDS = [
  { key: "issueKey", label: "Issue Key" },
  { key: "ownerPm", label: "PM" },
  { key: "ownerTl", label: "TL" },
  { key: "sprintGoal", label: "Sprint Goal" },
  { key: "currentProgress", label: "Current Progress" },
  { key: "upcomingWork", label: "Upcoming Work" },
  { key: "impactsOrRisks", label: "Impacts or Risks" },
  { key: "needsFromOtherTeams", label: "Needs from Other Teams" },
];

export function createEmptyTeamData() {
  return {
    issueKey: "",
    ownerPm: "",
    ownerTl: "",
    sprintGoal: "",
    currentProgress: "",
    upcomingWork: "",
    impactsOrRisks: "",
    needsFromOtherTeams: "",
  };
}
