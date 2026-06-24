import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  createSyncRun,
  ensureSeedData,
  finishSyncRun,
  getAudit,
  getLatestSyncRun,
  getMetrics,
  getOptions,
  listRows,
  updateRow,
  upsertRows,
} from "./db.js";
import { syncFromMcp } from "./mcpClient.js";

const app = express();
const port = Number(process.env.API_PORT || 5174);

ensureSeedData();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/dashboard", (req, res) => {
  const rows = listRows({
    scrumTeam: req.query.scrumTeam,
    alliGroup: req.query.alliGroup,
    sprintIteration: req.query.sprintIteration,
    riskLevel: req.query.riskLevel,
    search: req.query.search,
    sortBy: req.query.sortBy,
  });

  res.json({
    rows,
    metrics: getMetrics(rows),
    options: getOptions(),
    latestSync: getLatestSyncRun(),
  });
});

app.get("/api/options", (_req, res) => {
  res.json(getOptions());
});

app.patch("/api/rows/:id", (req, res) => {
  const row = updateRow(Number(req.params.id), req.body, {
    source: "manual",
    actor: req.header("x-user") || "local-user",
  });

  if (!row) {
    res.status(404).json({ error: "Row not found" });
    return;
  }

  res.json({ row });
});

app.get("/api/rows/:id/audit", (req, res) => {
  res.json({ audit: getAudit(Number(req.params.id)) });
});

app.post("/api/sync", async (_req, res) => {
  const syncRunId = createSyncRun();

  try {
    const result = await syncFromMcp();
    upsertRows(result.rows, { source: "jira-mcp" });
    finishSyncRun(syncRunId, {
      status: "success",
      issueCount: result.issueCount,
      pageCount: result.pageCount,
    });

    const rows = listRows();
    res.json({
      ok: true,
      message: `Synced ${result.issueCount} Jira issues${result.pageCount ? ` and ${result.pageCount} Confluence pages` : ""}.`,
      issueToolName: result.issueToolName,
      rows,
      metrics: getMetrics(rows),
      options: getOptions(),
      latestSync: getLatestSyncRun(),
    });
  } catch (error) {
    const statusCode = error.code === "MCP_NOT_CONFIGURED" ? 400 : 500;
    finishSyncRun(syncRunId, {
      status: "failed",
      error: error.message,
    });

    res.status(statusCode).json({
      ok: false,
      error: error.message,
      latestSync: getLatestSyncRun(),
    });
  }
});

app.use((error, _req, res, _next) => {
  void _next;
  console.error(error);
  res.status(500).json({ error: "Unexpected API error" });
});

app.listen(port, () => {
  console.log(`XFN dashboard API listening on http://localhost:${port}`);
});
