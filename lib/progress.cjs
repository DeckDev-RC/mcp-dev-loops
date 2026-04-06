// ============================================================
// DEVS-LOOP - Cross-session progress log
// Append-only markdown log to preserve human and agent context
// across sessions and context resets.
// ============================================================

const fs = require("fs");
const path = require("path");
const { findProjectRoot } = require("./paths.cjs");

function getProgressPath() {
  return path.join(findProjectRoot(), "devs-loop-progress.md");
}

function ensureFile() {
  const progressPath = getProgressPath();
  if (!fs.existsSync(progressPath)) {
    fs.writeFileSync(progressPath, "", "utf8");
  }
  return progressPath;
}

function formatMinutes(totalMinutes = 0) {
  if (!totalMinutes || totalMinutes <= 0) return "0min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function parseTaskLine(line) {
  const match = line.match(/^- (✅|⏳) ([^:]+): (.+?)(?: \((.+)\))?$/);
  if (!match) return null;
  return {
    completed: match[1] === "✅",
    type: match[2].trim(),
    name: match[3].trim(),
    duration: match[4] || null,
  };
}

function parseSessions(content) {
  const lines = content.split(/\r?\n/);
  const sessions = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("## Sessão ")) {
      if (current) sessions.push(current);

      const heading = line.match(/^## Sessão (.+?) \| (.+?) \| (.+)$/);
      current = {
        heading: line,
        date: heading?.[1] || "",
        project: heading?.[2] || "",
        initiative: heading?.[3] || "",
        tasks: [],
        raw: [line],
      };
      continue;
    }

    if (!current) continue;

    current.raw.push(line);

    if (line.startsWith("- ")) {
      const task = parseTaskLine(line);
      if (task) current.tasks.push(task);
    }
  }

  if (current) sessions.push(current);
  return sessions;
}

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function loadRecentSessions(project, initiative, limit = 2) {
  const progressPath = getProgressPath();
  if (!fs.existsSync(progressPath)) return [];

  const content = fs.readFileSync(progressPath, "utf8");
  const sessions = parseSessions(content);
  const normalizedProject = normalize(project);
  const normalizedInitiative = normalize(initiative);

  const filtered = sessions.filter((session) => normalize(session.project) === normalizedProject);
  const exactInitiative = normalizedInitiative
    ? filtered.filter((session) => normalize(session.initiative) === normalizedInitiative)
    : [];

  const pool = exactInitiative.length > 0 ? exactInitiative : filtered;
  return pool.slice(-limit);
}

function formatRecentSessions(sessions) {
  if (!sessions || sessions.length === 0) return null;

  const lines = ["📚 Progresso recente encontrado:"];

  for (const session of sessions) {
    lines.push(`- ${session.date} | ${session.project} | ${session.initiative}`);
    for (const task of session.tasks.slice(0, 6)) {
      const duration = task.duration ? ` (${task.duration})` : "";
      const icon = task.completed ? "✅" : "⏳";
      lines.push(`  ${icon} ${task.type}: ${task.name}${duration}`);
    }
  }

  return lines.join("\n");
}

function appendSession(summary) {
  const progressPath = ensureFile();
  const lines = [];

  lines.push(`## Sessão ${summary.date} | ${summary.project} | ${summary.initiative}`);

  if (summary.listPath) {
    lines.push(`Lista: ${summary.listPath}`);
  }

  lines.push(`Tempo total: ${summary.totalTime}`);

  for (const task of summary.tasks || []) {
    const icon = task.completed ? "✅" : "⏳";
    const taskType = task.type || "Task";
    const duration = task.minutes > 0 ? ` (${formatMinutes(task.minutes)})` : "";
    lines.push(`- ${icon} ${taskType}: ${task.name}${duration}`);
  }

  lines.push("");

  let prefix = "";
  const existing = fs.readFileSync(progressPath, "utf8");
  if (existing.trim().length > 0 && !existing.endsWith("\n\n")) {
    prefix = existing.endsWith("\n") ? "\n" : "\n\n";
  }

  fs.appendFileSync(progressPath, `${prefix}${lines.join("\n")}`, "utf8");
}

module.exports = {
  appendSession,
  formatMinutes,
  formatRecentSessions,
  getProgressPath,
  loadRecentSessions,
};
