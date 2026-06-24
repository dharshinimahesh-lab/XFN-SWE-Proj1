import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
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
  Activity,
} from "lucide-react";
import "./XFNCenter.css";

const metricIcons = {
  Target,
  CheckCircle2,
  AlertTriangle,
  Users,
};

const initialData = {
  teams: [],
  metrics: [],
  sprints: [],
  lastSync: null,
  project: "",
};

function formatSyncTime(value) {
  if (!value) {
    return "Awaiting first sync";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Filter({ label, value, onClick }) {
  return (
    <button className="filter" onClick={onClick} type="button">
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      <ChevronDown size={16} />
    </button>
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

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export default function XFNCenter() {
  const [projects, setProjects] = useState([]);
  const [dashboard, setDashboard] = useState(initialData);
  const [project, setProject] = useState("");
  const [sprint, setSprint] = useState("");
  const [selectedIssueKey, setSelectedIssueKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const selectedTeam = useMemo(
    () =>
      dashboard.teams.find((row) => row.issueKey === selectedIssueKey) || dashboard.teams[0] || null,
    [dashboard.teams, selectedIssueKey],
  );

  useEffect(() => {
    let active = true;

    fetchJson("/api/projects")
      .then((payload) => {
        if (!active) {
          return;
        }
        setProjects(payload.projects || []);
        setProject((currentProject) => {
          if (currentProject) {
            return currentProject;
          }
          return payload.defaultProject || payload.projects?.[0]?.key || "";
        });
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!project) {
      return;
    }

    const params = new URLSearchParams({ project });
    if (sprint) {
      params.set("sprint", sprint);
    }

    setLoading(true);
    setError("");

    fetchJson(`/api/dashboard?${params.toString()}`)
      .then((payload) => {
        setDashboard(payload);
        setSelectedIssueKey(payload.teams?.[0]?.issueKey || "");
      })
      .catch((fetchError) => {
        setError(fetchError.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [project, sprint]);

  async function handleSync() {
    if (!project) {
      return;
    }

    setSyncing(true);
    setError("");

    try {
      const payload = await fetchJson("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project, sprint }),
      });
      setDashboard(payload);
      setSelectedIssueKey(payload.teams?.[0]?.issueKey || "");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setSyncing(false);
    }
  }

  function cycleProject(direction) {
    if (!projects.length) {
      return;
    }

    const currentIndex = projects.findIndex((item) => item.key === project);
    const nextIndex = (currentIndex + direction + projects.length) % projects.length;
    setSprint("");
    setProject(projects[nextIndex].key);
  }

  function cycleSprint(direction) {
    if (!dashboard.sprints.length) {
      return;
    }

    const options = ["", ...dashboard.sprints];
    const currentIndex = options.indexOf(sprint);
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    setSprint(options[nextIndex]);
  }

  return (
    <main className="xfn-page">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">XFN</div>
          <h1>Sprint Command Center</h1>
        </div>

        <div className="topbar-actions">
          <button className="sprint-picker" onClick={() => cycleSprint(1)} type="button">
            <span>Sprint:</span>
            <strong>{sprint || "All"}</strong>
            <ChevronDown size={16} />
            <Calendar size={18} />
          </button>

          <span className="sync-meta">Last sync: {formatSyncTime(dashboard.lastSync)}</span>

          <button className="ghost-button" onClick={handleSync} type="button">
            <RefreshCw size={16} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>

          <button className="icon-button notification-button" type="button">
            <Bell size={20} />
            <span>{dashboard.teams.length}</span>
          </button>

          <button className="avatar" type="button">
            JR
          </button>
        </div>
      </header>

      <section className="filters-row">
        <label className="search-box">
          <span>{project ? `Live Jira project: ${project}` : "Loading Jira projects..."}</span>
          <Search size={19} />
        </label>

        <Filter
          label="Project"
          value={project || "Loading"}
          onClick={() => cycleProject(1)}
        />
        <Filter
          label="Sprint"
          value={sprint || "All"}
          onClick={() => cycleSprint(1)}
        />
        <Filter
          label="Selected Team"
          value={selectedTeam?.team || "None"}
          onClick={() => {}}
        />
        <Filter
          label="Risk Level"
          value={selectedTeam?.risks?.length ? "Flagged" : "Clear"}
          onClick={() => {}}
        />
        <Filter label="Sort By" value="Updated" onClick={() => {}} />

        <button className="icon-button" type="button">
          <SlidersHorizontal size={20} />
        </button>

        <button className="save-button" type="button">
          <Bookmark size={17} />
          Live View
        </button>
      </section>

      {error ? <p className="empty-cell">Jira error: {error}</p> : null}

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
                    <th>Met?</th>
                    <th>Risks</th>
                    <th>Needs</th>
                    <th>Health</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {dashboard.teams.map((row) => (
                    <tr
                      key={row.issueKey}
                      className={selectedTeam?.issueKey === row.issueKey ? "selected-row" : ""}
                      onClick={() => setSelectedIssueKey(row.issueKey)}
                    >
                      <td>
                        <button className="team-link" type="button">
                          {row.team}
                        </button>
                      </td>
                      <td>
                        <StatusPill tone={row.group === "General" ? "blue" : "purple"}>
                          {row.group}
                        </StatusPill>
                      </td>
                      <td>{row.goal}</td>
                      <td>
                        <StatusPill tone={row.met ? "green" : "red"}>
                          {row.met ? "Yes" : "No"}
                          <ChevronDown size={13} />
                        </StatusPill>
                      </td>
                      <td>
                        {row.risks.length ? (
                          row.risks.map((risk) => (
                            <span className="inline-risk" key={risk}>
                              <Dot tone="orange" />
                              {risk}
                            </span>
                          ))
                        ) : (
                          <span className="empty-cell">—</span>
                        )}
                      </td>
                      <td>
                        {row.needs.length ? (
                          row.needs.map((need) => (
                            <span className="inline-risk" key={need}>
                              <Dot tone="orange" />
                              {need}
                            </span>
                          ))
                        ) : (
                          <span className="empty-cell">—</span>
                        )}
                      </td>
                      <td>
                        <StatusPill tone={row.health === "At Risk" ? "orange" : "green"}>
                          {row.health}
                        </StatusPill>
                      </td>
                      <td>
                        <MoreVertical size={17} />
                      </td>
                    </tr>
                  ))}

                  {!loading && dashboard.teams.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan="8">
                        No Jira issues matched this project and sprint selection.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <footer className="table-footer">
              <span>
                {loading ? "Loading Jira issues..." : `Showing ${dashboard.teams.length} live Jira issues`}
              </span>
              <div className="pagination">
                <button onClick={() => cycleProject(-1)} type="button">
                  <ChevronLeft size={17} />
                </button>
                <button className="active-page" type="button">
                  {project || "—"}
                </button>
                <button onClick={() => cycleProject(1)} type="button">
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </article>

          <article className="panel detail-panel">
            <div className="detail-header">
              <div>
                <h2>{selectedTeam?.team || "No Team Selected"}</h2>
                <StatusPill tone={selectedTeam?.health === "At Risk" ? "orange" : "green"}>
                  {selectedTeam?.health || "Waiting for Jira"}
                </StatusPill>
              </div>
              <ChevronUp size={19} />
            </div>

            <div className="details-grid">
              <div className="details-stack">
                <DetailItem
                  icon={Shield}
                  tone="orange"
                  title={`Risk Alert: ${selectedTeam?.risks?.length ? "Flagged" : "Clear"}`}
                  body={
                    selectedTeam?.risks?.length
                      ? `${selectedTeam.risks.length} risk item(s) pulled from Jira`
                      : "No Jira risk text found on this issue."
                  }
                />
                <DetailItem
                  icon={BarChart3}
                  tone="blue"
                  title={selectedTeam?.issueKey || "Jira Issue"}
                  body={selectedTeam?.status || "No issue selected."}
                />
                <DetailItem
                  icon={Target}
                  tone="green"
                  title="Sprint Goal"
                  body={selectedTeam?.goal || "No sprint goal found."}
                />
                <DetailItem
                  icon={CalendarDays}
                  tone="blue"
                  title="Sprint Coverage"
                  body={selectedTeam?.sprints?.join(", ") || "No sprint value on this issue."}
                />
              </div>

              <div className="details-stack">
                <DetailItem
                  icon={Activity}
                  tone="green"
                  title="Current Progress"
                  body={selectedTeam?.details?.progress || "No delivery progress provided."}
                />
                <DetailItem
                  icon={Link2}
                  tone="orange"
                  title="Impediments"
                  body={selectedTeam?.needs?.join(" | ") || "No blockers or dependencies found."}
                />
                <DetailItem
                  icon={Users}
                  tone="purple"
                  title="Need From Other Teams"
                  body={selectedTeam?.details?.pmUpdate || "No PM update provided in Jira."}
                />

                <div className="confidence">
                  <div className="detail-icon detail-green">
                    <Smile size={19} />
                  </div>
                  <div>
                    <h4>Assignee</h4>
                    <div className="radio-row">
                      <label>
                        <input checked readOnly type="radio" />
                        <span>{selectedTeam?.assignee || "Unassigned"}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="detail-actions">
              <button className="secondary-button" type="button">
                <Plus size={16} />
                {selectedTeam?.issueKey || "View Issue"}
              </button>
              <button className="primary-button" type="button">
                {dashboard.project ? `Project ${dashboard.project}` : "Select a Project"}
              </button>
            </footer>
          </article>
        </section>

        <aside className="metrics-column">
          {dashboard.metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </aside>
      </div>
    </main>
  );
}
