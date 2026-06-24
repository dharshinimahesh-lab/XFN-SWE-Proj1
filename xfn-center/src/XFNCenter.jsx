import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Link2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Smile,
  Target,
  Users,
} from "lucide-react";
import "./XFNCenter.css";
import { TEAM_FIELDS, createEmptyTeamData } from "./teamCatalog";

const PAGE_SIZE = 5;
const VIEW_STORAGE_KEY = "xfn-center-view";
const EDITS_STORAGE_KEY = "xfn-center-team-edits";

const defaultView = {
  boardId: "",
  search: "",
  group: "All",
  team: "All",
  risk: "All",
  sortBy: "Group",
};

const metricIcons = {
  Target,
  CheckCircle2,
  AlertTriangle,
  Users,
};

function loadSavedJson(key, fallback) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function fetchJson(path) {
  return fetch(path).then(async (response) => {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  });
}

function formatSyncTime(value) {
  if (!value) {
    return "Awaiting Jira data";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function previewText(value) {
  return value?.trim() ? value : "—";
}

function inferTeamFamily(teamName, boardName) {
  const value = `${teamName || ""} ${boardName || ""}`.toLowerCase();

  if (value.includes("data science")) {
    return "Data Science";
  }

  if (value.includes("insights") || value.includes("audience planner")) {
    return "Insights";
  }

  if (
    value.includes("workflow") ||
    value.includes("marketplace") ||
    value.includes("template") ||
    value.includes("creative studio") ||
    value.includes("actions")
  ) {
    return "Actions";
  }

  if (
    value.includes("data") ||
    value.includes("home court") ||
    value.includes("homecourt") ||
    value.includes("scenario") ||
    value.includes("generative dashboards") ||
    value.includes("categorizations")
  ) {
    return "Data";
  }

  if (value.includes("core")) {
    return "Core";
  }

  return teamName || "Other";
}

function teamHasRisks(team) {
  return Boolean(team.impactsOrRisks.trim());
}

function teamHasNeeds(team) {
  return Boolean(team.needsFromOtherTeams.trim());
}

function sortTeams(teams, sortBy) {
  const values = [...teams];
  values.sort((left, right) => {
    if (sortBy === "Team") {
      return left.team.localeCompare(right.team);
    }

    if (sortBy === "Updated") {
      return (right.liveUpdatedAt || "").localeCompare(left.liveUpdatedAt || "") || left.team.localeCompare(right.team);
    }

    return left.group.localeCompare(right.group) || left.team.localeCompare(right.team);
  });
  return values;
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="filter filter-select">
      <span>
        <small>{label}</small>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function StatusPill({ children, tone = "green" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Dot({ tone = "orange" }) {
  return <span className={`dot dot-${tone}`} />;
}

function MetricCard({ metric }) {
  const Icon = metricIcons[metric.icon] || Target;

  return (
    <article className="metric-card">
      <div className={`metric-icon metric-${metric.tone}`}>
        <Icon size={26} />
      </div>
      <div>
        <h3>{metric.label}</h3>
        <div className="metric-value-row">
          <strong>{metric.value}</strong>
          <span>{metric.sub}</span>
        </div>
        <p>{metric.delta}</p>
      </div>
    </article>
  );
}

function DetailItem({ icon: Icon, title, body, tone }) {
  return (
    <div className="detail-item">
      <div className={`detail-icon detail-${tone}`}>
        <Icon size={19} />
      </div>
      <div>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

function toEditableBase(issue) {
  return {
    issueKey: issue.issueKey || "",
    team: issue.team || "",
    group: issue.group || "",
    status: issue.status || "",
    assignee: issue.assignee || "",
    sprintGoal: issue.goal || "",
    currentProgress: issue.details?.progress || issue.details?.pmUpdate || "",
    upcomingWork: "",
    impactsOrRisks: (issue.risks || []).join("\n"),
    needsFromOtherTeams: (issue.needs || []).join("\n"),
    liveUpdatedAt: issue.updated || "",
  };
}

export default function XFNCenter() {
  const [view, setView] = useState(() => loadSavedJson(VIEW_STORAGE_KEY, defaultView));
  const [issueEdits, setIssueEdits] = useState(() => loadSavedJson(EDITS_STORAGE_KEY, {}));
  const [boards, setBoards] = useState([]);
  const [boardPayload, setBoardPayload] = useState({ teams: [], metrics: [], total: 0, lastSync: "" });
  const [spaceName, setSpaceName] = useState("Alli AI & Software Engineering");
  const [spaceKey, setSpaceKey] = useState("ALLI");
  const [selectedIssueKey, setSelectedIssueKey] = useState("");
  const [page, setPage] = useState(1);
  const [saveState, setSaveState] = useState("Save View");
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(EDITS_STORAGE_KEY, JSON.stringify(issueEdits));
  }, [issueEdits]);

  useEffect(() => {
    setLoadingBoards(true);
    fetchJson("/api/boards")
      .then((payload) => {
        const nextBoards = payload.boards || [];
        setBoards(nextBoards);
        setSpaceName(payload.spaceProjectName || "Alli AI & Software Engineering");
        setSpaceKey(payload.spaceProjectKey || "ALLI");
        setView((current) => ({
          ...current,
          boardId: current.boardId || String(nextBoards[0]?.id || ""),
        }));
      })
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoadingBoards(false));
  }, []);

  useEffect(() => {
    if (!view.boardId) {
      return;
    }

    setLoadingBoard(true);
    setError("");
    fetchJson(`/api/board?boardId=${encodeURIComponent(view.boardId)}&maxResults=200`)
      .then((payload) => {
        setBoardPayload(payload);
        setSpaceName(payload.spaceProjectName || spaceName);
        setSpaceKey(payload.spaceProjectKey || spaceKey);
        setSelectedIssueKey(payload.teams?.[0]?.issueKey || "");
      })
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoadingBoard(false));
  }, [view.boardId, refreshToken]);

  const teams = useMemo(
    () =>
      (boardPayload.teams || []).map((issue) => {
        const base = toEditableBase(issue);
        const edits = issueEdits[issue.issueKey] || {};
        const merged = {
          storageKey: issue.issueKey,
          ...base,
          ...edits,
        };
        return {
          ...merged,
          teamFamily: inferTeamFamily(merged.team, boardPayload.boardName),
        };
      }),
    [boardPayload.teams, boardPayload.boardName, issueEdits],
  );

  const boardOptions = useMemo(
    () =>
      boards.map((board) => ({
        value: String(board.id),
        label: `${board.name} (${board.type})`,
      })),
    [boards],
  );

  const groupOptions = useMemo(
    () => ["All", ...new Set(teams.map((team) => team.group).filter(Boolean))],
    [teams],
  );

  const teamOptions = useMemo(() => {
    const scopedTeams = view.group === "All" ? teams : teams.filter((team) => team.group === view.group);
    return ["All", ...new Set(scopedTeams.map((team) => team.teamFamily).filter(Boolean))];
  }, [teams, view.group]);

  const filteredTeams = useMemo(() => {
    const search = view.search.trim().toLowerCase();

    return sortTeams(
      teams.filter((team) => {
        if (view.group !== "All" && team.group !== view.group) {
          return false;
        }
        if (view.team !== "All" && team.teamFamily !== view.team) {
          return false;
        }
        if (view.risk === "Flagged" && !teamHasRisks(team)) {
          return false;
        }
        if (view.risk === "Clear" && teamHasRisks(team)) {
          return false;
        }
        if (!search) {
          return true;
        }
        return [
          team.issueKey,
          team.team,
          team.teamFamily,
          team.group,
          team.status,
          team.assignee,
          team.sprintGoal,
          team.currentProgress,
          team.upcomingWork,
          team.impactsOrRisks,
          team.needsFromOtherTeams,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      }),
      view.sortBy,
    );
  }, [teams, view]);

  useEffect(() => {
    setPage(1);
  }, [view.search, view.group, view.team, view.risk, view.sortBy, view.boardId]);

  useEffect(() => {
    if (!filteredTeams.some((team) => team.storageKey === selectedIssueKey)) {
      setSelectedIssueKey(filteredTeams[0]?.storageKey || "");
    }
  }, [filteredTeams, selectedIssueKey]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTeams = filteredTeams.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedTeam =
    filteredTeams.find((team) => team.storageKey === selectedIssueKey) ||
    teams.find((team) => team.storageKey === selectedIssueKey) ||
    teams[0] ||
    null;

  const metrics = useMemo(() => {
    if (boardPayload.metrics?.length) {
      return boardPayload.metrics;
    }

    const riskTeams = teams.filter((team) => teamHasRisks(team)).length;
    const needsTeams = teams.filter((team) => teamHasNeeds(team)).length;

    return [
      {
        label: "Board Issues",
        value: String(filteredTeams.length),
        sub: "loaded",
        delta: "Current board scope",
        tone: "blue",
        icon: "Target",
      },
      {
        label: "Editable Issues",
        value: String(teams.length),
        sub: "rows",
        delta: "Live issues with editable overlays",
        tone: "green",
        icon: "CheckCircle2",
      },
      {
        label: "Risk Notes",
        value: String(riskTeams),
        sub: "issues",
        delta: "Pulled or edited",
        tone: "orange",
        icon: "AlertTriangle",
      },
      {
        label: "Needs Logged",
        value: String(needsTeams),
        sub: "issues",
        delta: "Pulled or edited",
        tone: "purple",
        icon: "Users",
      },
    ];
  }, [boardPayload.metrics, filteredTeams.length, teams]);

  function updateView(key, value) {
    setView((current) => ({ ...current, [key]: value }));
  }

  function updateSelectedTeamField(field, value) {
    if (!selectedTeam) {
      return;
    }

    setIssueEdits((current) => ({
      ...current,
      [selectedTeam.storageKey]: {
        ...(current[selectedTeam.storageKey] || createEmptyTeamData()),
        [field]: value,
      },
    }));
  }

  function resetSelectedIssueOverrides() {
    if (!selectedTeam) {
      return;
    }

    setIssueEdits((current) => {
      const next = { ...current };
      delete next[selectedTeam.storageKey];
      return next;
    });
  }

  return (
    <main className="xfn-page">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">XFN</div>
          <h1>Sprint Command Center</h1>
        </div>

        <div className="topbar-actions">
          <div className="sprint-picker">
            <span>Space:</span>
            <strong>{spaceKey}</strong>
            <Calendar size={18} />
          </div>

          <div className="sprint-picker">
            <span>Board:</span>
            <strong>{boards.find((board) => String(board.id) === view.boardId)?.name || "Loading"}</strong>
            <Calendar size={18} />
          </div>

          <span className="sync-meta">Last Jira pull: {formatSyncTime(boardPayload.lastSync)}</span>

          <button className="ghost-button" onClick={() => setRefreshToken((value) => value + 1)} type="button">
            <RefreshCw size={16} />
            {loadingBoard ? "Pulling..." : "Pull Live Data"}
          </button>

          <button className="icon-button notification-button" type="button">
            <Bell size={20} />
            <span>{teams.filter((team) => teamHasRisks(team)).length}</span>
          </button>

          <button className="avatar" type="button">
            XFN
          </button>
        </div>
      </header>

      <section className="filters-row">
        <label className="search-box">
          <input
            aria-label="Search issues"
            placeholder={`Search ${spaceKey} issues, teams, assignees, goals, risks...`}
            type="text"
            value={view.search}
            onChange={(event) => updateView("search", event.target.value)}
          />
          <Search size={19} />
        </label>

        <FilterSelect
          label={`${spaceKey} Board`}
          value={view.boardId}
          options={boardOptions}
          onChange={(value) => updateView("boardId", value)}
        />
        <FilterSelect
          label="Team"
          value={view.team}
          options={teamOptions}
          onChange={(value) => updateView("team", value)}
        />
        <FilterSelect
          label="Group"
          value={view.group}
          options={groupOptions}
          onChange={(value) => {
            setView((current) => ({
              ...current,
              group: value,
              team:
                current.team !== "All" &&
                value !== "All" &&
                !teams.some((team) => team.group === value && team.teamFamily === current.team)
                  ? "All"
                  : current.team,
            }));
          }}
        />
        <FilterSelect
          label="Risk Level"
          value={view.risk}
          options={["All", "Flagged", "Clear"]}
          onChange={(value) => updateView("risk", value)}
        />
        <FilterSelect
          label="Sort By"
          value={view.sortBy}
          options={["Group", "Team", "Updated"]}
          onChange={(value) => updateView("sortBy", value)}
        />

        <button className="icon-button" onClick={() => setView((current) => ({ ...defaultView, boardId: current.boardId }))} type="button">
          <SlidersHorizontal size={20} />
        </button>

        <button
          className="save-button"
          onClick={() => {
            window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
            setSaveState("Saved");
            window.setTimeout(() => setSaveState("Save View"), 1200);
          }}
          type="button"
        >
          <Bookmark size={17} />
          {saveState}
        </button>
      </section>

      {loadingBoards ? <p className="empty-cell">Loading {spaceName} boards...</p> : null}
      {error ? <p className="empty-cell">Jira error: {error}</p> : null}

      <div className="dashboard-grid">
        <section className="main-column">
          <article className="panel">
            <div className="panel-header">
              <h2>Board Issues</h2>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Team</th>
                    <th>Group</th>
                    <th>Sprint Goal</th>
                    <th>Risks</th>
                    <th>Needs</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageTeams.map((row) => (
                    <tr
                      key={row.storageKey}
                      className={selectedTeam?.storageKey === row.storageKey ? "selected-row" : ""}
                      onClick={() => setSelectedIssueKey(row.storageKey)}
                    >
                      <td>
                        <button className="team-link" type="button">
                          {row.issueKey}
                        </button>
                      </td>
                      <td>{previewText(row.teamFamily)}</td>
                      <td>
                        <StatusPill tone={row.group === "General" ? "blue" : "purple"}>
                          {previewText(row.group)}
                        </StatusPill>
                      </td>
                      <td>{previewText(row.sprintGoal)}</td>
                      <td>
                        {teamHasRisks(row) ? (
                          <span className="inline-risk">
                            <Dot tone="orange" />
                            {row.impactsOrRisks}
                          </span>
                        ) : (
                          <span className="empty-cell">—</span>
                        )}
                      </td>
                      <td>
                        {teamHasNeeds(row) ? (
                          <span className="inline-risk">
                            <Dot tone="orange" />
                            {row.needsFromOtherTeams}
                          </span>
                        ) : (
                          <span className="empty-cell">—</span>
                        )}
                      </td>
                      <td>
                        <MoreVertical size={17} />
                      </td>
                    </tr>
                  ))}
                  {pageTeams.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan="7">
                        No issues match the current board and filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="table-footer">
              <span>
                {filteredTeams.length === 0
                  ? "0 issues"
                  : `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filteredTeams.length)} of ${filteredTeams.length} loaded issues`}
              </span>
              <div className="pagination">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  <ChevronLeft size={17} />
                </button>
                <button className="active-page" type="button">
                  {currentPage}
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  type="button"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </article>

          {selectedTeam ? (
            <article className="panel detail-panel">
              <div className="detail-header">
                <div>
                  <h2>{selectedTeam.issueKey || selectedTeam.team || "Issue"}</h2>
                  <StatusPill tone={teamHasRisks(selectedTeam) ? "orange" : "green"}>
                    {teamHasRisks(selectedTeam) ? "Risk Flagged" : "No Risk Flagged"}
                  </StatusPill>
                </div>
                <ChevronUp size={19} />
              </div>

              <div className="details-grid">
                <div className="details-stack">
                  <DetailItem
                    icon={Shield}
                    tone={teamHasRisks(selectedTeam) ? "orange" : "green"}
                    title="Pulled Live"
                    body={selectedTeam.liveUpdatedAt ? `Jira data loaded for ${selectedTeam.issueKey}.` : "No live issue data loaded."}
                  />
                  <DetailItem icon={BarChart3} tone="blue" title="Status" body={previewText(selectedTeam.status)} />
                  <DetailItem icon={Target} tone="green" title="Assignee" body={previewText(selectedTeam.assignee)} />
                  <DetailItem
                    icon={CalendarDays}
                    tone="blue"
                    title="Last Live Update"
                    body={formatSyncTime(selectedTeam.liveUpdatedAt)}
                  />
                </div>

                <div className="details-stack">
                  <DetailItem
                    icon={Activity}
                    tone="green"
                    title="Editable Overlay"
                    body="Every field below starts with pulled Jira data when available, and teams can edit any field locally from there."
                  />
                  <DetailItem
                    icon={Link2}
                    tone="orange"
                    title="Team"
                    body={`${previewText(selectedTeam.teamFamily)}${selectedTeam.team && selectedTeam.team !== selectedTeam.teamFamily ? ` (${selectedTeam.team})` : ""}`}
                  />
                  <DetailItem icon={Users} tone="purple" title="Group" body={previewText(selectedTeam.group)} />
                  <div className="confidence">
                    <div className="detail-icon detail-green">
                      <Smile size={19} />
                    </div>
                    <div>
                      <h4>Fields In Scope</h4>
                      <div className="radio-row">
                        <label>
                          <input checked readOnly type="radio" />
                          <span>{TEAM_FIELDS.length} editable fields</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="editor-grid">
                {TEAM_FIELDS.map((field) => (
                  <label className="editor-field" key={field.key}>
                    <span>{field.label}</span>
                    {field.multiline ? (
                      <textarea
                        rows={4}
                        value={selectedTeam[field.key]}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={selectedTeam[field.key]}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <footer className="detail-actions">
                <button className="secondary-button" onClick={resetSelectedIssueOverrides} type="button">
                  <Plus size={16} />
                  Reset Overrides
                </button>
                <button className="primary-button" onClick={() => setRefreshToken((value) => value + 1)} type="button">
                  Pull Jira Again
                </button>
              </footer>
            </article>
          ) : null}
        </section>

        <aside className="metrics-column">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </aside>
      </div>
    </main>
  );
}
