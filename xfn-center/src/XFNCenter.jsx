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
import { TEAM_CATALOG, TEAM_FIELDS, SPRINT_LABEL, createEmptyTeamData } from "./teamCatalog";

const PAGE_SIZE = 5;
const VIEW_STORAGE_KEY = "xfn-center-view";
const EDITS_STORAGE_KEY = "xfn-center-team-edits";

const defaultView = {
  search: "",
  group: "All",
  team: "All",
  sprint: SPRINT_LABEL,
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
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function formatSyncTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function previewText(value) {
  return value?.trim() ? value : "—";
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
      return right.updatedAt.localeCompare(left.updatedAt) || left.team.localeCompare(right.team);
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
            <option key={option} value={option}>
              {option}
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

export default function XFNCenter() {
  const [view, setView] = useState(() => loadSavedJson(VIEW_STORAGE_KEY, defaultView));
  const [teamEdits, setTeamEdits] = useState(() => loadSavedJson(EDITS_STORAGE_KEY, {}));
  const [selectedTeamName, setSelectedTeamName] = useState(TEAM_CATALOG[0]?.team || "");
  const [page, setPage] = useState(1);
  const [lastRefresh, setLastRefresh] = useState(() => new Date().toISOString());
  const [saveState, setSaveState] = useState("Save View");

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(EDITS_STORAGE_KEY, JSON.stringify(teamEdits));
  }, [teamEdits]);

  const teams = useMemo(
    () =>
      TEAM_CATALOG.map((teamMeta) => {
        const edits = teamEdits[teamMeta.team] || createEmptyTeamData();
        return {
          ...teamMeta,
          ...edits,
          updatedAt: edits.updatedAt || "",
        };
      }),
    [teamEdits],
  );

  const groupOptions = useMemo(
    () => ["All", ...new Set(TEAM_CATALOG.map((team) => team.group))],
    [],
  );

  const teamOptions = useMemo(() => {
    const scopedTeams =
      view.group === "All" ? TEAM_CATALOG : TEAM_CATALOG.filter((team) => team.group === view.group);
    return ["All", ...scopedTeams.map((team) => team.team)];
  }, [view.group]);

  const filteredTeams = useMemo(() => {
    const search = view.search.trim().toLowerCase();

    return sortTeams(
      teams.filter((team) => {
        if (view.group !== "All" && team.group !== view.group) {
          return false;
        }

        if (view.team !== "All" && team.team !== view.team) {
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
          team.team,
          team.group,
          team.issueKey,
          team.ownerPm,
          team.ownerTl,
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
  }, [view]);

  useEffect(() => {
    if (!filteredTeams.some((team) => team.team === selectedTeamName)) {
      setSelectedTeamName(filteredTeams[0]?.team || TEAM_CATALOG[0]?.team || "");
    }
  }, [filteredTeams, selectedTeamName]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTeams = filteredTeams.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedTeam =
    filteredTeams.find((team) => team.team === selectedTeamName) ||
    teams.find((team) => team.team === selectedTeamName) ||
    teams[0];

  const metrics = useMemo(() => {
    const goalsSet = teams.filter((team) => team.sprintGoal.trim()).length;
    const riskTeams = teams.filter((team) => teamHasRisks(team)).length;
    const needsTeams = teams.filter((team) => teamHasNeeds(team)).length;
    const ownersSet = teams.filter((team) => team.ownerPm.trim() || team.ownerTl.trim()).length;

    return [
      {
        label: "Tracked Teams",
        value: String(filteredTeams.length),
        sub: "in scope",
        delta: "From the XFN sync roster",
        tone: "blue",
        icon: "Target",
      },
      {
        label: "Goals Filled",
        value: `${goalsSet} / ${teams.length}`,
        sub: "teams",
        delta: "Editable team data",
        tone: "green",
        icon: "CheckCircle2",
      },
      {
        label: "Risk Notes",
        value: String(riskTeams),
        sub: "teams",
        delta: "Impacts or risks entered",
        tone: "orange",
        icon: "AlertTriangle",
      },
      {
        label: "Owners Set",
        value: String(ownersSet),
        sub: "teams",
        delta: "PM or TL entered",
        tone: "purple",
        icon: "Users",
      },
    ];
  }, [filteredTeams.length, teams]);

  function updateView(key, value) {
    setView((current) => ({ ...current, [key]: value }));
  }

  function updateSelectedTeamField(field, value) {
    if (!selectedTeam) {
      return;
    }

    setTeamEdits((current) => ({
      ...current,
      [selectedTeam.team]: {
        ...(current[selectedTeam.team] || createEmptyTeamData()),
        [field]: value,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function resetSelectedTeam() {
    if (!selectedTeam) {
      return;
    }

    setTeamEdits((current) => {
      const next = { ...current };
      delete next[selectedTeam.team];
      return next;
    });
  }

  function saveView() {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    setSaveState("Saved");
    window.setTimeout(() => setSaveState("Save View"), 1200);
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
            <span>Sprint:</span>
            <strong>{view.sprint}</strong>
            <Calendar size={18} />
          </div>

          <span className="sync-meta">Last refresh: {formatSyncTime(lastRefresh)}</span>

          <button className="ghost-button" onClick={() => setLastRefresh(new Date().toISOString())} type="button">
            <RefreshCw size={16} />
            Refresh View
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
            aria-label="Search teams"
            placeholder="Search teams, owners, goals, risks, needs..."
            type="text"
            value={view.search}
            onChange={(event) => updateView("search", event.target.value)}
          />
          <Search size={19} />
        </label>

        <FilterSelect
          label="Scrum Team"
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
                !TEAM_CATALOG.some((team) => team.group === value && team.team === current.team)
                  ? "All"
                  : current.team,
            }));
          }}
        />
        <FilterSelect
          label="Sprint Iteration"
          value={view.sprint}
          options={[SPRINT_LABEL]}
          onChange={(value) => updateView("sprint", value)}
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

        <button className="icon-button" onClick={() => setView(defaultView)} type="button">
          <SlidersHorizontal size={20} />
        </button>

        <button className="save-button" onClick={saveView} type="button">
          <Bookmark size={17} />
          {saveState}
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="main-column">
          <article className="panel">
            <div className="panel-header">
              <h2>Team Progress Grid</h2>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Group</th>
                    <th>Sprint Goal</th>
                    <th>Current Progress</th>
                    <th>Risks</th>
                    <th>Needs</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {pageTeams.map((row) => (
                    <tr
                      key={row.team}
                      className={selectedTeam?.team === row.team ? "selected-row" : ""}
                      onClick={() => setSelectedTeamName(row.team)}
                    >
                      <td>
                        <button className="team-link" type="button">
                          {row.team}
                        </button>
                      </td>
                      <td>
                        <StatusPill tone={row.group === "Actions" ? "blue" : "purple"}>
                          {row.group}
                        </StatusPill>
                      </td>
                      <td>{previewText(row.sprintGoal)}</td>
                      <td>{previewText(row.currentProgress)}</td>
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
                        No teams match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="table-footer">
              <span>
                {filteredTeams.length === 0
                  ? "0 teams"
                  : `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filteredTeams.length)} of ${filteredTeams.length} teams`}
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
                  <h2>{selectedTeam.team}</h2>
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
                    title="What We Care About"
                    body="This view tracks the teams named in the XFN sync doc and the fields that matter there: owners, sprint goal, current progress, upcoming work, impacts or risks, and needs from other teams."
                  />
                  <DetailItem
                    icon={BarChart3}
                    tone="blue"
                    title="Group"
                    body={selectedTeam.group}
                  />
                  <DetailItem
                    icon={Target}
                    tone="green"
                    title="Editable Team View"
                    body="Edits here are real UI state, not values copied from the PDF, and they persist locally in your browser."
                  />
                  <DetailItem
                    icon={CalendarDays}
                    tone="blue"
                    title="Sprint Iteration"
                    body={view.sprint}
                  />
                </div>

                <div className="details-stack">
                  <DetailItem
                    icon={Activity}
                    tone="green"
                    title="Last Updated"
                    body={selectedTeam.updatedAt ? formatSyncTime(selectedTeam.updatedAt) : "No edits yet"}
                  />
                  <DetailItem
                    icon={Link2}
                    tone="orange"
                    title="Issue Linkage"
                    body={selectedTeam.issueKey || "No issue key entered yet"}
                  />
                  <DetailItem
                    icon={Users}
                    tone="purple"
                    title="Owners"
                    body={`PM: ${selectedTeam.ownerPm || "—"} · TL: ${selectedTeam.ownerTl || "—"}`}
                  />

                  <div className="confidence">
                    <div className="detail-icon detail-green">
                      <Smile size={19} />
                    </div>
                    <div>
                      <h4>Editable Fields</h4>
                      <div className="radio-row">
                        <label>
                          <input checked readOnly type="radio" />
                          <span>{TEAM_FIELDS.length} fields in scope</span>
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
                    {field.key === "issueKey" || field.key === "ownerPm" || field.key === "ownerTl" ? (
                      <input
                        type="text"
                        value={selectedTeam[field.key]}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    ) : (
                      <textarea
                        rows={4}
                        value={selectedTeam[field.key]}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <footer className="detail-actions">
                <button className="secondary-button" onClick={resetSelectedTeam} type="button">
                  <Plus size={16} />
                  Reset Team
                </button>
                <button className="primary-button" onClick={() => setLastRefresh(new Date().toISOString())} type="button">
                  Save Fields
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
