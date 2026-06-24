export const SPRINT_LABEL = "2026-06-08";

export const TEAM_CATALOG = [
  { team: "Velocity", group: "Insights" },
  { team: "Business Insights", group: "Insights" },
  { team: "Creative Insights", group: "Insights" },
  { team: "Audience Planner", group: "Insights" },
  { team: "Creative Studio - Template Generator", group: "Actions" },
  { team: "Creative Studio - Editing & Delivery", group: "Actions" },
  { team: "GenWorkflows", group: "Actions" },
  { team: "Workflows Platform", group: "Actions" },
  { team: "Workflows Templates", group: "Actions" },
  { team: "Marketplace", group: "Actions" },
  { team: "Data Explorer (+UDA)", group: "Data" },
  { team: "Media/Scenario Planner", group: "Data" },
  { team: "Generative Dashboards", group: "Data" },
  { team: "Agentic Homecourt", group: "Data" },
  { team: "Categorizations", group: "Data" },
  { team: "Data Library", group: "Data" },
  { team: "Semantic Layer", group: "Data" },
  { team: "Core (Platforms/MCPs/360)", group: "Core" },
  { team: "Data Science", group: "Data Science" },
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
