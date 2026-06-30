import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import "./XFNCenter.css";
import { TEAM_FIELDS, createEmptyTeamData } from "./teamCatalog";

const PAGE_SIZE = 6;
const VIEW_STORAGE_KEY = "xfn-center-view";
const EDITS_STORAGE_KEY = "xfn-center-team-edits";
const MANUAL_TEAMS_STORAGE_KEY = "xfn-center-manual-teams";

const defaultView = {
  boardId: "",
  search: "",
  group: "All",
  team: "All",
  risk: "All",
  sortBy: "Product Goal",
};

const metricIcons = {
  Target,
  CheckCircle2,
  AlertTriangle,
  Users,
};

function loadSavedObject(key, fallback) {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) {
      return fallback;
    }
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function loadSavedArray(key) {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("\n");
  }
  return value ? String(value) : "";
}

function hasText(value) {
  return normalizeText(value).trim().length > 0;
}

function previewText(value) {
  const normalized = normalizeText(value).trim();
  return normalized || "—";
}

function compactText(value, max = 88) {
  const normalized = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "—";
  }
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function teamHasRisks(team) {
  return hasText(team.impactsOrRisks);
}

function teamHasNeeds(team) {
  return hasText(team.needsFromOtherTeams);
}

function sortTeams(teams, sortBy) {
  const values = [...teams];

  values.sort((left, right) => {
    if (sortBy === "Updated") {
      return (right.liveUpdatedAt || "").localeCompare(left.liveUpdatedAt || "");
    }

    if (sortBy === "Team") {
      return (left.team || "").localeCompare(right.team || "") || (left.productGoal || "").localeCompare(right.productGoal || "");
    }

    if (sortBy === "Group") {
      return (left.group || "").localeCompare(right.group || "") || (left.team || "").localeCompare(right.team || "");
    }

    return (left.productGoal || "").localeCompare(right.productGoal || "") || (left.team || "").localeCompare(right.team || "");
  });

  return values;
}

function toEditableBase(team) {
  return {
    ...createEmptyTeamData(),
    storageKey: team.storageKey || team.issueKey || `entry-${Math.random().toString(36).slice(2, 8)}`,
    issueKey: team.issueKey || "",
    issueUrl: team.issueUrl || "",
    team: team.team || "",
    group: team.group || "",
    status: team.status || "",
    assignee: team.assignee || "",
    productGoal: team.productGoal || "",
    currentProgress: normalizeText(team.currentProgress),
    upcomingWork: normalizeText(team.upcomingWork),
    impactsOrRisks: normalizeText(team.impactsOrRisks),
    needsFromOtherTeams: normalizeText(team.needsFromOtherTeams),
    health: team.health || "",
    liveUpdatedAt: team.liveUpdatedAt || "",
    sourceBoardName: team.sourceBoardName || "",
    sprintName: team.sprintName || "",
    sprintState: team.sprintState || "",
    children: Array.isArray(team.children) ? team.children : [],
    manual: Boolean(team.manual),
  };
}

function createManualTeam(boardId, boardName) {
  return {
    ...createEmptyTeamData(),
    storageKey: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    boardId,
    issueUrl: "",
    health: "Manual",
    liveUpdatedAt: "",
    sourceBoardName: boardName || "Manual Team",
    sprintName: "",
    sprintState: "manual",
    children: [],
    manual: true,
  };
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

function StatusPill({ children, tone = "blue" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
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

function DetailItem({ icon: Icon, title, body, tone = "blue" }) {
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

function linkLabel(team) {
  if (team.manual) {
    return team.issueKey || "Manual entry";
  }
  return team.issueKey || "Jira epic";
}

function healthTone(team) {
  if (team.manual) {
    return "blue";
  }
  if (teamHasRisks(team)) {
    return "orange";
  }
  if ((team.status || "").toLowerCase() === "done") {
    return "green";
  }
  return "purple";
}

function normalizeOptionValue(value, options, fallback = "All") {
  return options.includes(value) ? value : fallback;
}

export default function XFNCenter() {
  const [view, setView] = useState(() => loadSavedObject(VIEW_STORAGE_KEY, defaultView));
  const [issueEdits, setIssueEdits] = useState(() => loadSavedObject(EDITS_STORAGE_KEY, {}));
  const [manualTeams, setManualTeams] = useState(() => loadSavedArray(MANUAL_TEAMS_STORAGE_KEY));
  const [boards, setBoards] = useState([]);
  const [boardPayload, setBoardPayload] = useState({ teams: [], total: 0, lastSync: "", sprintLabel: "" });
  const [spaceName, setSpaceName] = useState("Alli AI & Software Engineering");
  const [spaceKey, setSpaceKey] = useState("ALLI");
  const [selectedIssueKey, setSelectedIssueKey] = useState("");
  const [page, setPage] = useState(1);
  const [saveState, setSaveState] = useState("Save View");
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(EDITS_STORAGE_KEY, JSON.stringify(issueEdits));
  }, [issueEdits]);

  useEffect(() => {
    window.localStorage.setItem(MANUAL_TEAMS_STORAGE_KEY, JSON.stringify(manualTeams));
  }, [manualTeams]);

  useEffect(() => {
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

    fetchJson(`/api/board?boardId=${encodeURIComponent(view.boardId)}&maxResults=500`)
      .then((payload) => {
        setBoardPayload(payload);
        setSpaceName(payload.spaceProjectName || "Alli AI & Software Engineering");
        setSpaceKey(payload.spaceProjectKey || "ALLI");
      })
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoadingBoard(false));
  }, [view.boardId, refreshToken]);

  const selectedBoard = useMemo(
    () => boards.find((board) => String(board.id) === view.boardId) || null,
    [boards, view.boardId],
  );

  const liveTeams = useMemo(
    () =>
      (boardPayload.teams || []).map((team) => {
        const base = toEditableBase(team);
        const edits = issueEdits[base.storageKey] || {};
        return { ...base, ...edits };
      }),
    [boardPayload.teams, issueEdits],
  );

  const scopedManualTeams = useMemo(
    () => manualTeams.filter((team) => team.boardId === view.boardId).map((team) => ({ ...team })),
    [manualTeams, view.boardId],
  );

  const teams = useMemo(() => [...liveTeams, ...scopedManualTeams], [liveTeams, scopedManualTeams]);

  const boardOptions = useMemo(
    () =>
      boards.map((board) => ({
        value: String(board.id),
        label: board.name,
      })),
    [boards],
  );

  const groupOptions = useMemo(
    () => ["All", ...new Set(teams.map((team) => team.group).filter(Boolean))],
    [teams],
  );

  const effectiveBoardId = useMemo(
    () => normalizeOptionValue(view.boardId, boardOptions.map((option) => option.value), boardOptions[0]?.value || ""),
    [boardOptions, view.boardId],
  );

  const effectiveGroup = useMemo(
    () => normalizeOptionValue(view.group, groupOptions),
    [groupOptions, view.group],
  );

  const teamOptions = useMemo(() => {
    const scopedTeams = effectiveGroup === "All" ? teams : teams.filter((team) => team.group === effectiveGroup);
    return ["All", ...new Set(scopedTeams.map((team) => team.team).filter(Boolean))];
  }, [effectiveGroup, teams]);

  const effectiveTeam = useMemo(
    () => normalizeOptionValue(view.team, teamOptions),
    [teamOptions, view.team],
  );

  const effectiveRisk = useMemo(
    () => normalizeOptionValue(view.risk, ["All", "Flagged", "Clear"]),
    [view.risk],
  );

  const effectiveSort = useMemo(
    () => normalizeOptionValue(view.sortBy, ["Product Goal", "Team", "Group", "Updated"], "Product Goal"),
    [view.sortBy],
  );

  const filteredTeams = useMemo(() => {
    const search = view.search.trim().toLowerCase();

    return sortTeams(
      teams.filter((team) => {
        if (effectiveGroup !== "All" && team.group !== effectiveGroup) {
          return false;
        }

        if (effectiveTeam !== "All" && team.team !== effectiveTeam) {
          return false;
        }

        if (effectiveRisk === "Flagged" && !teamHasRisks(team)) {
          return false;
        }

        if (effectiveRisk === "Clear" && teamHasRisks(team)) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [
          team.issueKey,
          team.team,
          team.group,
          team.status,
          team.assignee,
          team.productGoal,
          team.currentProgress,
          team.upcomingWork,
          team.impactsOrRisks,
          team.needsFromOtherTeams,
          team.sourceBoardName,
          team.sprintName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      }),
      effectiveSort,
    );
  }, [effectiveGroup, effectiveRisk, effectiveSort, effectiveTeam, teams, view.search]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTeams = filteredTeams.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeSelectedIssueKey = filteredTeams.some((team) => team.storageKey === selectedIssueKey)
    ? selectedIssueKey
    : filteredTeams[0]?.storageKey || "";

  const selectedTeam =
    filteredTeams.find((team) => team.storageKey === activeSelectedIssueKey) ||
    teams.find((team) => team.storageKey === activeSelectedIssueKey) ||
    null;

  const metrics = useMemo(() => {
    const riskTeams = teams.filter((team) => teamHasRisks(team)).length;
    const manualCount = scopedManualTeams.length;

    return [
      {
        label: "Product Goal Entries",
        value: String(teams.length),
        sub: "editable rows",
        delta: "Live Jira epics plus manual teams",
        tone: "blue",
        icon: "Target",
      },
      {
        label: "Filtered Results",
        value: String(filteredTeams.length),
        sub: "visible now",
        delta: selectedBoard?.name || "Current board",
        tone: "green",
        icon: "CheckCircle2",
      },
      {
        label: "Risk Notes",
        value: String(riskTeams),
        sub: "entries",
        delta: "Pulled from Jira or edited locally",
        tone: "orange",
        icon: "AlertTriangle",
      },
      {
        label: "Manual Teams",
        value: String(manualCount),
        sub: "local entries",
        delta: "Available in this board view",
        tone: "purple",
        icon: "Users",
      },
    ];
  }, [filteredTeams.length, scopedManualTeams.length, selectedBoard?.name, teams]);

  function updateView(key, value) {
    setView((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function createManualEntry() {
    if (!view.boardId) {
      return;
    }

    const entry = createManualTeam(view.boardId, selectedBoard?.name);
    setManualTeams((current) => [entry, ...current]);
    setSelectedIssueKey(entry.storageKey);
    setPage(1);
  }

  function refreshBoardData() {
    setLoadingBoard(true);
    setError("");
    setRefreshToken((value) => value + 1);
  }

  function updateSelectedTeamField(field, value) {
    if (!selectedTeam) {
      return;
    }

    if (selectedTeam.manual) {
      setManualTeams((current) =>
        current.map((team) => (team.storageKey === selectedTeam.storageKey ? { ...team, [field]: value } : team)),
      );
      return;
    }

    setIssueEdits((current) => ({
      ...current,
      [selectedTeam.storageKey]: {
        ...(current[selectedTeam.storageKey] || {}),
        [field]: value,
      },
    }));
  }

  function resetSelectedEntry() {
    if (!selectedTeam || selectedTeam.manual) {
      return;
    }

    setIssueEdits((current) => {
      const next = { ...current };
      delete next[selectedTeam.storageKey];
      return next;
    });
  }

  function removeSelectedManualTeam() {
    if (!selectedTeam || !selectedTeam.manual) {
      return;
    }

    setManualTeams((current) => current.filter((team) => team.storageKey !== selectedTeam.storageKey));
  }

  const sourceBoardSummary = selectedBoard?.sourceBoards?.length
    ? selectedBoard.sourceBoards.map((board) => board.name).join(", ")
    : "No source boards loaded";

  return (
    <main className="xfn-page">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">XFN</div>
          <div>
            <p className="eyebrow">{spaceName}</p>
            <h1>Epic Team Tracker</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="space-chip">
            <span>Space</span>
            <strong>{spaceKey}</strong>
          </div>

          <span className="sync-meta">Last Jira pull: {formatSyncTime(boardPayload.lastSync)}</span>

          <button className="ghost-button" onClick={refreshBoardData} type="button">
            <RefreshCw size={16} />
            {loadingBoard ? "Pulling..." : "Pull Live Data"}
          </button>

          <button className="primary-button" onClick={createManualEntry} type="button">
            <Plus size={16} />
            Add Manual Team
          </button>
        </div>
      </header>

      <section className="board-context">
        <div>
          <h2>{selectedBoard?.name || "Loading board"}</h2>
          <p>{boardPayload.sprintLabel || "Current or most recent sprint scope will appear here once Jira data loads."}</p>
        </div>
        <div className="source-block">
          <small>Boards included from the ALLI space</small>
          <strong>{sourceBoardSummary}</strong>
        </div>
      </section>

      <section className="filters-row">
        <label className="search-box">
          <input
            aria-label="Search epics and teams"
            placeholder={`Search ${spaceKey} epics, teams, groups, progress, risks...`}
            type="text"
            value={view.search}
            onChange={(event) => updateView("search", event.target.value)}
          />
          <Search size={19} />
        </label>

        <FilterSelect
          label="Board"
          value={effectiveBoardId}
          options={boardOptions}
          onChange={(value) => {
            setLoadingBoard(true);
            setError("");
            updateView("boardId", value);
          }}
        />
        <FilterSelect
          label="Team"
          value={effectiveTeam}
          options={teamOptions}
          onChange={(value) => updateView("team", value)}
        />
        <FilterSelect
          label="Group"
          value={effectiveGroup}
          options={groupOptions}
          onChange={(value) => {
            setPage(1);
            setView((current) => ({
              ...current,
              group: value,
              team: current.team !== "All" && value !== "All" && !teams.some((team) => team.group === value && team.team === current.team) ? "All" : current.team,
            }));
          }}
        />
        <FilterSelect
          label="Risk"
          value={effectiveRisk}
          options={["All", "Flagged", "Clear"]}
          onChange={(value) => updateView("risk", value)}
        />
        <FilterSelect
          label="Sort"
          value={effectiveSort}
          options={["Product Goal", "Team", "Group", "Updated"]}
          onChange={(value) => updateView("sortBy", value)}
        />

        <button
          className="icon-button"
          onClick={() => {
            setView((current) => ({ ...defaultView, boardId: current.boardId }));
            setPage(1);
          }}
          type="button"
        >
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
              <h2>Board Entries</h2>
              <p>Each row maps to a Jira epic, with the team name coming from the epic component and the group coming from the responsible team.</p>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Epic</th>
                    <th>Team</th>
                    <th>Group</th>
                    <th>Product Goal</th>
                    <th>Risks</th>
                    <th>Needs</th>
                    <th>Source</th>
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
                        <div className="cell-stack">
                          {row.issueUrl ? (
                            <a className="team-link" href={row.issueUrl} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                              {linkLabel(row)}
                              <ExternalLink size={14} />
                            </a>
                          ) : (
                            <span className="manual-link">{linkLabel(row)}</span>
                          )}
                          <small>{previewText(row.status)}</small>
                        </div>
                      </td>
                      <td>{previewText(row.team)}</td>
                      <td>
                        <StatusPill tone={healthTone(row)}>{previewText(row.group)}</StatusPill>
                      </td>
                      <td>{compactText(row.productGoal)}</td>
                      <td>{teamHasRisks(row) ? compactText(row.impactsOrRisks, 56) : <span className="empty-cell">—</span>}</td>
                      <td>{teamHasNeeds(row) ? compactText(row.needsFromOtherTeams, 56) : <span className="empty-cell">—</span>}</td>
                      <td>{previewText(row.sourceBoardName)}</td>
                    </tr>
                  ))}
                  {pageTeams.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan="7">
                        No product goal entries match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="table-footer">
              <span>
                {filteredTeams.length === 0
                  ? "0 entries"
                  : `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filteredTeams.length)} of ${filteredTeams.length} entries`}
              </span>
              <div className="pagination">
                <button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
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
                  <h2>{selectedTeam.team || selectedTeam.issueKey || "Entry"}</h2>
                  <div className="detail-pill-row">
                    <StatusPill tone={selectedTeam.manual ? "blue" : "green"}>
                      {selectedTeam.manual ? "Manual Team" : "Live Jira Epic"}
                    </StatusPill>
                    <StatusPill tone={healthTone(selectedTeam)}>
                      {teamHasRisks(selectedTeam) ? "Risk Flagged" : previewText(selectedTeam.health || "On Track")}
                    </StatusPill>
                  </div>
                </div>
              </div>

              <div className="details-grid">
                <div className="details-stack">
                  <DetailItem
                    icon={Shield}
                    tone={selectedTeam.manual ? "blue" : "green"}
                    title="Source"
                    body={selectedTeam.manual ? "Created manually in this app for a team that is not yet represented in Jira." : `Pulled live from Jira epic ${selectedTeam.issueKey}.`}
                  />
                  <DetailItem icon={BarChart3} tone="blue" title="Status" body={previewText(selectedTeam.status)} />
                  <DetailItem icon={Users} tone="purple" title="Group" body={previewText(selectedTeam.group)} />
                  <DetailItem icon={Activity} tone="green" title="Team" body={previewText(selectedTeam.team)} />
                </div>

                <div className="details-stack">
                  <DetailItem icon={Target} tone="blue" title="Product Goal" body={previewText(selectedTeam.productGoal)} />
                  <DetailItem
                    icon={Link2}
                    tone="orange"
                    title="Source Board + Sprint"
                    body={`${previewText(selectedTeam.sourceBoardName)}${selectedTeam.sprintName ? ` • ${selectedTeam.sprintName}` : ""}`}
                  />
                  <DetailItem icon={CheckCircle2} tone="green" title="Assignee" body={previewText(selectedTeam.assignee)} />
                  <DetailItem
                    icon={RefreshCw}
                    tone="blue"
                    title="Last Live Update"
                    body={selectedTeam.manual ? "Manual entries do not have a Jira sync timestamp." : formatSyncTime(selectedTeam.liveUpdatedAt)}
                  />
                </div>
              </div>

              <section className="linked-issues">
                <div className="section-head">
                  <h3>Linked Sprint Issues</h3>
                  <span>{selectedTeam.children?.length || 0} linked</span>
                </div>
                {selectedTeam.children?.length ? (
                  <ul className="issue-list">
                    {selectedTeam.children.map((child) => (
                      <li key={child.issueKey}>
                        <a href={child.issueUrl} rel="noreferrer" target="_blank">
                          {child.issueKey}
                        </a>
                        <span>{child.summary}</span>
                        <small>{child.status}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-cell">No linked sprint issues are attached to this entry.</p>
                )}
              </section>

              <div className="editor-grid">
                {TEAM_FIELDS.map((field) => (
                  <label className="editor-field" key={field.key}>
                    <span>{field.label}</span>
                    {field.multiline ? (
                      <textarea
                        rows={4}
                        value={selectedTeam[field.key] || ""}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={selectedTeam[field.key] || ""}
                        onChange={(event) => updateSelectedTeamField(field.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <footer className="detail-actions">
                <div className="detail-action-group">
                  {selectedTeam.manual ? (
                    <button className="secondary-button" onClick={removeSelectedManualTeam} type="button">
                      <Trash2 size={16} />
                      Delete Manual Team
                    </button>
                  ) : (
                    <button className="secondary-button" onClick={resetSelectedEntry} type="button">
                      <Plus size={16} />
                      Reset Jira Overrides
                    </button>
                  )}
                </div>

                <div className="detail-action-group">
                  {selectedTeam.issueUrl ? (
                    <a className="secondary-button link-button" href={selectedTeam.issueUrl} rel="noreferrer" target="_blank">
                      <ExternalLink size={16} />
                      Open in Jira
                    </a>
                  ) : null}
                  <button className="ghost-button detail-refresh" onClick={refreshBoardData} type="button">
                    <RefreshCw size={16} />
                    Pull Jira Again
                  </button>
                </div>
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
