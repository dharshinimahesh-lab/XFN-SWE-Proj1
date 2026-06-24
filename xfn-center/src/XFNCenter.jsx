import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  History,
  Link2,
  MoreVertical,
  RefreshCw,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Target,
  Users,
} from "lucide-react";
import "./XFNCenter.css";

const defaultFilters = {
  search: "",
  scrumTeam: "All",
  alliGroup: "All",
  sprintIteration: "All",
  riskLevel: "All",
  sortBy: "Group",
};

function StatusPill({ children, tone = "green" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Dot({ tone = "orange" }) {
  return <span className={`dot dot-${tone}`} />;
}

function MetricCard({ label, value, sub, tone, icon: Icon }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-${tone}`}>
        <Icon size={25} />
      </div>
      <div>
        <h3>{label}</h3>
        <div className="metric-value-row">
          <strong>{value}</strong>
          <span>{sub}</span>
        </div>
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
        <p>{body || "Not specified"}</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline = false }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterSelect({ label, name, value, options, onChange }) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select name={name} value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={16} />
    </label>
  );
}

function formatDate(value) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function splitList(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export default function XFNCenter() {
  const [filters, setFilters] = useState(defaultFilters);
  const [dashboard, setDashboard] = useState({
    rows: [],
    metrics: {
      totalGoals: 0,
      goalsMet: 0,
      goalRate: 0,
      openRisks: 0,
      openNeeds: 0,
      productGoals: [],
    },
    options: {
      scrumTeams: [],
      alliGroups: [],
      sprintIterations: [],
      riskLevels: [],
    },
    latestSync: null,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [audit, setAudit] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedRow = useMemo(() => {
    return dashboard.rows.find((row) => row.id === selectedId) || dashboard.rows[0] || null;
  }, [dashboard.rows, selectedId]);

  const metricCards = useMemo(() => {
    const metrics = dashboard.metrics;
    return [
      {
        label: "Sprint Goals",
        value: String(metrics.totalGoals),
        sub: "tracked",
        tone: "blue",
        icon: Target,
      },
      {
        label: "Goals Met",
        value: `${metrics.goalsMet} / ${metrics.totalGoals}`,
        sub: `${metrics.goalRate}%`,
        tone: "green",
        icon: CheckCircle2,
      },
      {
        label: "Open Risks",
        value: String(metrics.openRisks),
        sub: "risks and impacts",
        tone: "orange",
        icon: AlertTriangle,
      },
      {
        label: "Open Needs",
        value: String(metrics.openNeeds),
        sub: "dependencies",
        tone: "purple",
        icon: Users,
      },
    ];
  }, [dashboard.metrics]);

  const loadDashboard = useCallback(async (nextFilters = filters) => {
    setLoading(true);
    const params = new URLSearchParams();

    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value && value !== "All") {
        params.set(key, value);
      }
    });

    try {
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Dashboard API failed");
      }

      const data = await response.json();
      setDashboard(data);
      setNotice("");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDashboard(filters);
  }, [filters, loadDashboard]);

  useEffect(() => {
    if (selectedRow) {
      setDraft({
        ...selectedRow,
        risks: listText(selectedRow.risks),
        needs: listText(selectedRow.needs),
        impacts: listText(selectedRow.impacts),
      });
      setAudit([]);
      setShowAudit(false);
    }
  }, [selectedRow]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveDraft() {
    if (!selectedRow || !draft) {
      return;
    }

    setSaving(true);
    const payload = {
      scrumTeam: draft.scrumTeam,
      alliGroup: draft.alliGroup,
      sprintIteration: draft.sprintIteration,
      productGoal: draft.productGoal,
      sprintGoal: draft.sprintGoal,
      goalMet: draft.goalMet,
      confidence: draft.confidence,
      health: draft.health,
      riskLevel: draft.riskLevel,
      risks: splitList(draft.risks),
      needs: splitList(draft.needs),
      impacts: splitList(draft.impacts),
      progress: draft.progress,
      jiraUrl: draft.jiraUrl,
      confluenceUrl: draft.confluenceUrl,
    };

    try {
      const response = await fetch(`/api/rows/${selectedRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      await loadDashboard(filters);
      setNotice("Saved manual dashboard edits.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setNotice("");

    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sync failed");
      }

      setDashboard(data);
      setNotice(data.message || "Sync complete.");
    } catch (error) {
      setNotice(error.message);
      await loadDashboard(filters);
    } finally {
      setSyncing(false);
    }
  }

  async function loadAudit() {
    if (!selectedRow) {
      return;
    }

    const response = await fetch(`/api/rows/${selectedRow.id}/audit`);
    const data = await response.json();
    setAudit(data.audit || []);
    setShowAudit(true);
  }

  const options = dashboard.options;
  const selectedProductGoal = dashboard.metrics.productGoals.find(
    (item) => item.goal === selectedRow?.productGoal,
  );

  return (
    <main className="xfn-page">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">XFN</div>
          <h1>Sprint Command Center</h1>
        </div>

        <div className="topbar-actions">
          <button className="sprint-picker" type="button">
            <span>Sprint:</span>
            <strong>{filters.sprintIteration}</strong>
            <Calendar size={18} />
          </button>

          <span className="sync-meta">
            Last sync: {formatDate(dashboard.latestSync?.completed_at || dashboard.latestSync?.started_at)}
          </span>

          <button className="ghost-button" type="button" onClick={syncNow} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Syncing" : "Sync Now"}
          </button>

          <button className="icon-button notification-button" type="button" aria-label="Open alerts">
            <Bell size={20} />
            <span>{dashboard.metrics.openRisks}</span>
          </button>

          <button className="avatar" type="button">DM</button>
        </div>
      </header>

      <section className="filters-row">
        <label className="search-box">
          <input
            name="search"
            value={filters.search}
            onChange={updateFilter}
            placeholder="Search Walmart, Meta, Prime Days..."
          />
          <Search size={19} />
        </label>

        <FilterSelect
          label="Scrum Team"
          name="scrumTeam"
          value={filters.scrumTeam}
          options={["All", ...options.scrumTeams]}
          onChange={updateFilter}
        />
        <FilterSelect
          label="Alli Group"
          name="alliGroup"
          value={filters.alliGroup}
          options={["All", ...options.alliGroups]}
          onChange={updateFilter}
        />
        <FilterSelect
          label="Sprint"
          name="sprintIteration"
          value={filters.sprintIteration}
          options={["All", ...options.sprintIterations]}
          onChange={updateFilter}
        />
        <FilterSelect
          label="Risk"
          name="riskLevel"
          value={filters.riskLevel}
          options={["All", ...options.riskLevels]}
          onChange={updateFilter}
        />
        <FilterSelect
          label="Sort"
          name="sortBy"
          value={filters.sortBy}
          options={["Group", "Team", "Sprint", "Health", "Updated"]}
          onChange={updateFilter}
        />

        <button className="icon-button" type="button" aria-label="Filter settings">
          <SlidersHorizontal size={20} />
        </button>

        <button className="save-button" type="button">
          <Bookmark size={17} />
          Save View
        </button>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <div className="dashboard-grid">
        <section className="main-column">
          <article className="panel">
            <div className="panel-header panel-header-row">
              <h2>Team Progress Grid</h2>
              <span>{loading ? "Loading..." : `${dashboard.rows.length} rows`}</span>
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
                  {dashboard.rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedRow?.id === row.id ? "selected-row" : ""}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td>
                        <button className="team-link" type="button">{row.scrumTeam}</button>
                      </td>
                      <td>
                        <StatusPill tone={row.alliGroup === "Data" ? "blue" : "purple"}>
                          {row.alliGroup}
                        </StatusPill>
                      </td>
                      <td className="goal-cell">{row.sprintGoal}</td>
                      <td>
                        <StatusPill tone={row.goalMet ? "green" : "red"}>
                          {row.goalMet ? "Yes" : "No"}
                        </StatusPill>
                      </td>
                      <td>
                        {row.risks.length || row.impacts.length ? (
                          [...row.risks, ...row.impacts].slice(0, 2).map((risk) => (
                            <span className="inline-risk" key={risk}>
                              <Dot tone={row.riskLevel === "High" ? "red" : "orange"} />
                              {risk}
                            </span>
                          ))
                        ) : (
                          <span className="empty-cell">None</span>
                        )}
                      </td>
                      <td>
                        {row.needs.length ? (
                          row.needs.slice(0, 2).map((need) => (
                            <span className="inline-risk" key={need}>
                              <Dot tone="orange" />
                              {need}
                            </span>
                          ))
                        ) : (
                          <span className="empty-cell">None</span>
                        )}
                      </td>
                      <td>
                        <StatusPill tone={row.health === "On Track" ? "green" : "orange"}>
                          {row.health}
                        </StatusPill>
                      </td>
                      <td>
                        <MoreVertical size={17} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          {selectedRow && draft && (
            <article className="panel detail-panel">
              <div className="detail-header">
                <div>
                  <h2>{selectedRow.scrumTeam}</h2>
                  <StatusPill tone={selectedRow.health === "On Track" ? "green" : "orange"}>
                    {selectedRow.health}
                  </StatusPill>
                </div>
                <span className="source-pill">
                  <Database size={15} />
                  {selectedRow.source}
                </span>
              </div>

              <div className="details-grid">
                <div className="details-stack">
                  <DetailItem
                    icon={Shield}
                    tone={selectedRow.riskLevel === "High" ? "orange" : "blue"}
                    title={`Risk Alert: ${selectedRow.riskLevel}`}
                    body={[...selectedRow.risks, ...selectedRow.impacts].join("; ")}
                  />
                  <DetailItem
                    icon={BarChart3}
                    tone="blue"
                    title="Progress"
                    body={selectedRow.progress}
                  />
                  <DetailItem
                    icon={Target}
                    tone="green"
                    title="Product Goal Rollup"
                    body={
                      selectedProductGoal
                        ? `${selectedProductGoal.completed} of ${selectedProductGoal.total} sprint goals complete for this product goal.`
                        : selectedRow.productGoal
                    }
                  />
                  <DetailItem
                    icon={Link2}
                    tone="purple"
                    title="Need From Other Teams"
                    body={selectedRow.needs.join("; ")}
                  />
                </div>

                <form className="edit-grid" onSubmit={(event) => event.preventDefault()}>
                  <Field label="Scrum Team" value={draft.scrumTeam} onChange={(value) => updateDraft("scrumTeam", value)} />
                  <Field label="Alli Group" value={draft.alliGroup} onChange={(value) => updateDraft("alliGroup", value)} />
                  <Field label="Sprint Iteration" value={draft.sprintIteration} onChange={(value) => updateDraft("sprintIteration", value)} />
                  <SelectField
                    label="Sprint Goal Met"
                    value={draft.goalMet ? "Yes" : "No"}
                    options={["Yes", "No"]}
                    onChange={(value) => updateDraft("goalMet", value === "Yes")}
                  />
                  <SelectField
                    label="Health"
                    value={draft.health}
                    options={["On Track", "Watching", "At Risk", "Unknown"]}
                    onChange={(value) => updateDraft("health", value)}
                  />
                  <SelectField
                    label="Risk Level"
                    value={draft.riskLevel}
                    options={["Low", "Medium", "High"]}
                    onChange={(value) => updateDraft("riskLevel", value)}
                  />
                  <Field label="Product Goal" value={draft.productGoal} onChange={(value) => updateDraft("productGoal", value)} multiline />
                  <Field label="Sprint Goal" value={draft.sprintGoal} onChange={(value) => updateDraft("sprintGoal", value)} multiline />
                  <Field label="Progress" value={draft.progress} onChange={(value) => updateDraft("progress", value)} multiline />
                  <Field label="Risks" value={draft.risks} onChange={(value) => updateDraft("risks", value)} multiline />
                  <Field label="Needs From Other Teams" value={draft.needs} onChange={(value) => updateDraft("needs", value)} multiline />
                  <Field label="Impacts" value={draft.impacts} onChange={(value) => updateDraft("impacts", value)} multiline />
                </form>
              </div>

              <footer className="detail-actions">
                <div className="link-row">
                  {selectedRow.jiraUrl && (
                    <a href={selectedRow.jiraUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                      Jira
                    </a>
                  )}
                  {selectedRow.confluenceUrl && (
                    <a href={selectedRow.confluenceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                      Confluence
                    </a>
                  )}
                </div>
                <div className="action-row">
                  <button className="secondary-button" type="button" onClick={loadAudit}>
                    <History size={16} />
                    View Audit Trail
                  </button>
                  <button className="primary-button" type="button" onClick={saveDraft} disabled={saving}>
                    <Save size={16} />
                    {saving ? "Saving" : "Save Edits"}
                  </button>
                </div>
              </footer>

              {showAudit && (
                <section className="audit-panel">
                  <h3>Manual Change Log</h3>
                  {audit.length ? (
                    audit.map((entry) => (
                      <div className="audit-row" key={entry.id}>
                        <strong>{entry.fieldName}</strong>
                        <span>{entry.source}</span>
                        <time>{formatDate(entry.changedAt)}</time>
                      </div>
                    ))
                  ) : (
                    <p>No manual edits recorded for this row yet.</p>
                  )}
                </section>
              )}
            </article>
          )}
        </section>

        <aside className="metrics-column">
          {metricCards.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
          <article className="panel product-rollup">
            <h2>Product Goal Rollup</h2>
            {dashboard.metrics.productGoals.map((item) => (
              <div className="rollup-row" key={item.goal || "Unassigned"}>
                <span>{item.goal || "Unassigned product goal"}</span>
                <strong>
                  {item.completed}/{item.total}
                </strong>
              </div>
            ))}
          </article>
          <article className="panel api-panel">
            <h2>Sync Source</h2>
            <p>
              Sync pulls Jira issues through MCP, normalizes them into SQLite, and keeps manual
              dashboard edits in the audit log.
            </p>
            <div className="api-status">
              <Activity size={16} />
              {dashboard.latestSync?.status || "Ready"}
            </div>
          </article>
        </aside>
      </div>
    </main>
  );
}
