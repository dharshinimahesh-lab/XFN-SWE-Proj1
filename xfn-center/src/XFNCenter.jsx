import React, { useState } from "react";
import {
  Bell,
  Calendar,
  ChevronDown,
  MoreVertical,
  Search,
  RefreshCw,
  Bookmark,
  Target,
  CheckCircle2,
  AlertTriangle,
  Users,
  Shield,
  BarChart3,
  CalendarDays,
  Activity,
  Link2,
  Smile,
  Plus,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import "./XFNCenter.css";

const teams = [
  {
    team: "Creative Insights",
    group: "Insights",
    goal: "Meta asset profile consumable...",
    met: true,
    risks: ["Meta SDK rate limits"],
    needs: ["Meta repo support"],
    health: "On Track",
  },
  {
    team: "Business Insights",
    group: "Insights",
    goal: "Enhance setup prompt for gene...",
    met: false,
    risks: ["PTO next week"],
    needs: [],
    health: "At Risk",
  },
  {
    team: "Audience Planner",
    group: "Insights",
    goal: "Implement Snapshot reach curre...",
    met: true,
    risks: [],
    needs: [],
    health: "On Track",
  },
  {
    team: "Data Library",
    group: "Data",
    goal: "Add new data tables for Prime Day...",
    met: true,
    risks: ["Walmart data erroring"],
    needs: [],
    health: "At Risk",
  },
  {
    team: "GenAaaS",
    group: "Data",
    goal: "Dual-SIM optimizations & stability...",
    met: false,
    risks: ["OOM risk"],
    needs: ["USA API"],
    health: "At Risk",
  },
];

const metrics = [
  {
    label: "Sprint Goals",
    value: "14",
    sub: "tracked",
    delta: "↑ 2 from last sprint",
    tone: "blue",
    icon: Target,
  },
  {
    label: "Goals Met",
    value: "9 / 14",
    sub: "64%",
    delta: "↑ 11% from last sprint",
    tone: "green",
    icon: CheckCircle2,
  },
  {
    label: "Open Risks",
    value: "6",
    sub: "high",
    delta: "↓ 1 from last sprint",
    tone: "orange",
    icon: AlertTriangle,
  },
  {
    label: "Unfulfilled Needs",
    value: "11",
    sub: "dependencies",
    delta: "— same as last sprint",
    tone: "purple",
    icon: Users,
  },
];

function Filter({ label, value }) {
  return (
    <button className="filter">
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
  const Icon = metric.icon;

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
  const [selectedTeam, setSelectedTeam] = useState("Creative Insights");

  return (
    <main className="xfn-page">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">XFN</div>
          <h1>Sprint Command Center</h1>
        </div>

        <div className="topbar-actions">
          <button className="sprint-picker">
            <span>Sprint:</span>
            <strong>2026-06-08</strong>
            <ChevronDown size={16} />
            <Calendar size={18} />
          </button>

          <span className="sync-meta">Last sync: Jun 8, 2026 · 10:42 AM</span>

          <button className="ghost-button">
            <RefreshCw size={16} />
            Sync Now
          </button>

          <button className="icon-button notification-button">
            <Bell size={20} />
            <span>2</span>
          </button>

          <button className="avatar">KH</button>
        </div>
      </header>

      <section className="filters-row">
        <label className="search-box">
          <span>Search keywords: Walmart, Meta, Prime Days...</span>
          <Search size={19} />
        </label>

        <Filter label="Scrum Team" value="All" />
        <Filter label="All Group" value="All" />
        <Filter label="Sprint Iteration" value="2026-06-08" />
        <Filter label="Risk Level" value="All" />
        <Filter label="Sort By" value="Group" />

        <button className="icon-button">
          <SlidersHorizontal size={20} />
        </button>

        <button className="save-button">
          <Bookmark size={17} />
          Save View
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
                    <th>Met?</th>
                    <th>Risks</th>
                    <th>Needs</th>
                    <th>Health</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {teams.map((row) => (
                    <tr
                      key={row.team}
                      className={selectedTeam === row.team ? "selected-row" : ""}
                      onClick={() => setSelectedTeam(row.team)}
                    >
                      <td>
                        <button className="team-link">{row.team}</button>
                      </td>
                      <td>
                        <StatusPill tone={row.group === "Data" ? "blue" : "purple"}>
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
                              <Dot tone={risk === "OOM risk" ? "red" : "orange"} />
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

            <footer className="table-footer">
              <span>1–5 of 10 teams selected</span>
              <div className="pagination">
                <button>
                  <ChevronLeft size={17} />
                </button>
                <button className="active-page">1</button>
                <button>2</button>
                <button>3</button>
                <button>
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </article>

          <article className="panel detail-panel">
            <div className="detail-header">
              <div>
                <h2>Creative Insights</h2>
                <StatusPill tone="green">On Track</StatusPill>
              </div>
              <ChevronUp size={19} />
            </div>

            <div className="details-grid">
              <div className="details-stack">
                <DetailItem
                  icon={Shield}
                  tone="orange"
                  title="Risk Alert: Medium"
                  body="1 risk identified"
                />
                <DetailItem
                  icon={BarChart3}
                  tone="blue"
                  title="Product Update"
                  body="JIRA-2891 has been approved and verified."
                />
                <DetailItem
                  icon={Target}
                  tone="green"
                  title="Sprint Goal"
                  body="Meta aggregated asset profile consumable for all owning teams to improve cross-campaign views."
                />
                <DetailItem
                  icon={CalendarDays}
                  tone="blue"
                  title="Upcoming Work"
                  body="Draft setup wizard v2 with new consent flows for new markets; social rollout plan and communications."
                />
              </div>

              <div className="details-stack">
                <DetailItem
                  icon={Activity}
                  tone="green"
                  title="Current Progress"
                  body="Fragmented insights are reducing and unifying, with manual extraction down compared to last sprint."
                />
                <DetailItem
                  icon={Link2}
                  tone="orange"
                  title="Impediments"
                  body="Issue with Meta & Access API for Futures SDK due to rate limitations; need support from Meta engineering."
                />
                <DetailItem
                  icon={Users}
                  tone="purple"
                  title="Need From Other Teams"
                  body="Creative Engineering for blob access."
                />

                <div className="confidence">
                  <div className="detail-icon detail-green">
                    <Smile size={19} />
                  </div>
                  <div>
                    <h4>Sprint Confidence</h4>

                    <div className="radio-row">
                      {["High", "Medium", "Low", "Not Yet Known"].map((item) => (
                        <label key={item}>
                          <input
                            type="radio"
                            name="confidence"
                            defaultChecked={item === "High"}
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="detail-actions">
              <button className="secondary-button">
                <Plus size={16} />
                View Audit Trail
              </button>
              <button className="primary-button">Compare Previous Sprint</button>
            </footer>
          </article>
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