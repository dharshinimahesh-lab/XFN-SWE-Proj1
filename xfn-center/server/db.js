import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedRows } from "./seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, "xfn-dashboard.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

const jsonFields = new Set(["risks", "needs", "impacts", "raw_json"]);
const boolFields = new Set(["goal_met"]);

const rowColumns = [
  "issue_key",
  "jira_url",
  "confluence_url",
  "scrum_team",
  "alli_group",
  "sprint_iteration",
  "product_goal",
  "sprint_goal",
  "goal_met",
  "confidence",
  "health",
  "risk_level",
  "risks",
  "needs",
  "impacts",
  "progress",
  "source",
  "raw_json",
  "updated_at",
  "last_synced_at",
];

const fieldToColumn = {
  issueKey: "issue_key",
  jiraUrl: "jira_url",
  confluenceUrl: "confluence_url",
  scrumTeam: "scrum_team",
  alliGroup: "alli_group",
  sprintIteration: "sprint_iteration",
  productGoal: "product_goal",
  sprintGoal: "sprint_goal",
  goalMet: "goal_met",
  confidence: "confidence",
  health: "health",
  riskLevel: "risk_level",
  risks: "risks",
  needs: "needs",
  impacts: "impacts",
  progress: "progress",
  source: "source",
  rawJson: "raw_json",
  updatedAt: "updated_at",
  lastSyncedAt: "last_synced_at",
};

const columnToField = Object.fromEntries(
  Object.entries(fieldToColumn).map(([field, column]) => [column, field]),
);

function serializeValue(column, value) {
  if (jsonFields.has(column)) {
    return JSON.stringify(value ?? (column === "raw_json" ? {} : []));
  }

  if (boolFields.has(column)) {
    return value ? 1 : 0;
  }

  return value ?? "";
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function toApiRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    issueKey: row.issue_key,
    jiraUrl: row.jira_url,
    confluenceUrl: row.confluence_url,
    scrumTeam: row.scrum_team,
    alliGroup: row.alli_group,
    sprintIteration: row.sprint_iteration,
    productGoal: row.product_goal,
    sprintGoal: row.sprint_goal,
    goalMet: Boolean(row.goal_met),
    confidence: row.confidence,
    health: row.health,
    riskLevel: row.risk_level,
    risks: parseJson(row.risks, []),
    needs: parseJson(row.needs, []),
    impacts: parseJson(row.impacts, []),
    progress: row.progress,
    source: row.source,
    rawJson: parseJson(row.raw_json, {}),
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
  };
}

export function ensureSeedData() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM xfn_rows").get();

  if (count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO xfn_rows (${rowColumns.join(", ")})
    VALUES (${rowColumns.map((column) => `@${column}`).join(", ")})
  `);

  const seed = db.transaction((rows) => {
    for (const row of rows) {
      const values = {};
      for (const [field, column] of Object.entries(fieldToColumn)) {
        values[column] = serializeValue(column, row[field]);
      }
      insert.run(values);
    }
  });

  seed(seedRows);
}

export function listRows(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.scrumTeam && filters.scrumTeam !== "All") {
    clauses.push("scrum_team = @scrumTeam");
    params.scrumTeam = filters.scrumTeam;
  }

  if (filters.alliGroup && filters.alliGroup !== "All") {
    clauses.push("alli_group = @alliGroup");
    params.alliGroup = filters.alliGroup;
  }

  if (filters.sprintIteration && filters.sprintIteration !== "All") {
    clauses.push("sprint_iteration = @sprintIteration");
    params.sprintIteration = filters.sprintIteration;
  }

  if (filters.riskLevel && filters.riskLevel !== "All") {
    clauses.push("risk_level = @riskLevel");
    params.riskLevel = filters.riskLevel;
  }

  if (filters.search) {
    clauses.push(`(
      scrum_team LIKE @search OR
      alli_group LIKE @search OR
      sprint_goal LIKE @search OR
      product_goal LIKE @search OR
      progress LIKE @search OR
      risks LIKE @search OR
      needs LIKE @search OR
      impacts LIKE @search
    )`);
    params.search = `%${filters.search}%`;
  }

  const sortMap = {
    Group: "alli_group ASC, scrum_team ASC",
    Team: "scrum_team ASC",
    Sprint: "sprint_iteration DESC, scrum_team ASC",
    Health: "health ASC, risk_level DESC",
    Updated: "updated_at DESC",
  };

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = sortMap[filters.sortBy] || sortMap.Group;
  return db
    .prepare(`SELECT * FROM xfn_rows ${where} ORDER BY ${orderBy}`)
    .all(params)
    .map(toApiRow);
}

export function getOptions() {
  const readDistinct = (column) =>
    db
      .prepare(`SELECT DISTINCT ${column} AS value FROM xfn_rows ORDER BY ${column}`)
      .all()
      .map((row) => row.value)
      .filter(Boolean);

  return {
    scrumTeams: readDistinct("scrum_team"),
    alliGroups: readDistinct("alli_group"),
    sprintIterations: readDistinct("sprint_iteration"),
    riskLevels: readDistinct("risk_level"),
  };
}

export function getLatestSyncRun() {
  return db
    .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1")
    .get();
}

export function getMetrics(rows) {
  const totalGoals = rows.length;
  const goalsMet = rows.filter((row) => row.goalMet).length;
  const openRisks = rows.reduce((total, row) => total + row.risks.length + row.impacts.length, 0);
  const openNeeds = rows.reduce((total, row) => total + row.needs.length, 0);
  const groupedProductGoals = new Map();

  for (const row of rows) {
    if (!groupedProductGoals.has(row.productGoal)) {
      groupedProductGoals.set(row.productGoal, { completed: 0, total: 0 });
    }

    const productGoal = groupedProductGoals.get(row.productGoal);
    productGoal.total += 1;
    if (row.goalMet) {
      productGoal.completed += 1;
    }
  }

  return {
    totalGoals,
    goalsMet,
    goalRate: totalGoals ? Math.round((goalsMet / totalGoals) * 100) : 0,
    openRisks,
    openNeeds,
    productGoals: [...groupedProductGoals.entries()].map(([goal, counts]) => ({
      goal,
      ...counts,
    })),
  };
}

export function updateRow(rowId, patch, { source = "manual", actor = "local-user" } = {}) {
  const existing = db.prepare("SELECT * FROM xfn_rows WHERE id = ?").get(rowId);
  if (!existing) {
    return null;
  }

  const allowedFields = [
    "scrumTeam",
    "alliGroup",
    "sprintIteration",
    "productGoal",
    "sprintGoal",
    "goalMet",
    "confidence",
    "health",
    "riskLevel",
    "risks",
    "needs",
    "impacts",
    "progress",
    "jiraUrl",
    "confluenceUrl",
  ];

  const assignments = [];
  const params = { id: rowId };
  const auditRows = [];
  const changedAt = new Date().toISOString();

  for (const field of allowedFields) {
    if (!(field in patch)) {
      continue;
    }

    const column = fieldToColumn[field];
    const oldValue = existing[column];
    const newValue = serializeValue(column, patch[field]);

    if (String(oldValue ?? "") === String(newValue ?? "")) {
      continue;
    }

    assignments.push(`${column} = @${column}`);
    params[column] = newValue;
    auditRows.push({
      row_id: rowId,
      field_name: field,
      old_value: oldValue,
      new_value: newValue,
      source,
      actor,
      changed_at: changedAt,
    });
  }

  if (!assignments.length) {
    return toApiRow(existing);
  }

  assignments.push("source = @source", "updated_at = @updated_at");
  params.source = source;
  params.updated_at = changedAt;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE xfn_rows SET ${assignments.join(", ")} WHERE id = @id`).run(params);

    const audit = db.prepare(`
      INSERT INTO audit_entries (row_id, field_name, old_value, new_value, source, actor, changed_at)
      VALUES (@row_id, @field_name, @old_value, @new_value, @source, @actor, @changed_at)
    `);

    for (const auditRow of auditRows) {
      audit.run(auditRow);
    }
  });

  tx();
  return toApiRow(db.prepare("SELECT * FROM xfn_rows WHERE id = ?").get(rowId));
}

export function upsertRows(rows, { source = "jira-mcp" } = {}) {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO xfn_rows (${rowColumns.join(", ")})
    VALUES (${rowColumns.map((column) => `@${column}`).join(", ")})
    ON CONFLICT(issue_key) DO UPDATE SET
      jira_url = excluded.jira_url,
      confluence_url = excluded.confluence_url,
      scrum_team = excluded.scrum_team,
      alli_group = excluded.alli_group,
      sprint_iteration = excluded.sprint_iteration,
      product_goal = excluded.product_goal,
      sprint_goal = excluded.sprint_goal,
      goal_met = excluded.goal_met,
      confidence = excluded.confidence,
      health = excluded.health,
      risk_level = excluded.risk_level,
      risks = excluded.risks,
      needs = excluded.needs,
      impacts = excluded.impacts,
      progress = excluded.progress,
      source = excluded.source,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at
  `);

  const tx = db.transaction((incomingRows) => {
    for (const row of incomingRows) {
      const values = {};
      const normalized = {
        issueKey: row.issueKey,
        jiraUrl: row.jiraUrl,
        confluenceUrl: row.confluenceUrl,
        scrumTeam: row.scrumTeam || "Unassigned",
        alliGroup: row.alliGroup || "Core",
        sprintIteration: row.sprintIteration || "Unassigned Sprint",
        productGoal: row.productGoal || "",
        sprintGoal: row.sprintGoal || row.summary || "",
        goalMet: Boolean(row.goalMet),
        confidence: row.confidence || "Not Yet Known",
        health: row.health || "Unknown",
        riskLevel: row.riskLevel || "Low",
        risks: row.risks || [],
        needs: row.needs || [],
        impacts: row.impacts || [],
        progress: row.progress || row.description || "",
        source,
        rawJson: row.rawJson || row,
        updatedAt: row.updatedAt || now,
        lastSyncedAt: now,
      };

      for (const [field, column] of Object.entries(fieldToColumn)) {
        values[column] = serializeValue(column, normalized[field]);
      }

      insert.run(values);
    }
  });

  tx(rows);
}

export function createSyncRun() {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO sync_runs (status, started_at) VALUES ('running', ?)")
    .run(startedAt);
  return result.lastInsertRowid;
}

export function finishSyncRun(id, { status, issueCount = 0, pageCount = 0, error = null }) {
  db.prepare(`
    UPDATE sync_runs
    SET status = @status,
      completed_at = @completedAt,
      issue_count = @issueCount,
      page_count = @pageCount,
      error = @error
    WHERE id = @id
  `).run({
    id,
    status,
    completedAt: new Date().toISOString(),
    issueCount,
    pageCount,
    error,
  });
}

export function getAudit(rowId) {
  const rows = db
    .prepare("SELECT * FROM audit_entries WHERE row_id = ? ORDER BY changed_at DESC, id DESC")
    .all(rowId);

  return rows.map((row) => ({
    id: row.id,
    rowId: row.row_id,
    fieldName: row.field_name,
    oldValue: parseAuditValue(row.field_name, row.old_value),
    newValue: parseAuditValue(row.field_name, row.new_value),
    source: row.source,
    actor: row.actor,
    changedAt: row.changed_at,
  }));
}

function parseAuditValue(fieldName, value) {
  const column = fieldToColumn[fieldName] || fieldName;

  if (jsonFields.has(column)) {
    return parseJson(value, []);
  }

  if (boolFields.has(column)) {
    return value === "1";
  }

  return value;
}

export function apiFieldToColumn(field) {
  return fieldToColumn[field];
}

export function columnToApiField(column) {
  return columnToField[column];
}
