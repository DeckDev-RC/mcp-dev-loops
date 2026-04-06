// ============================================================
// DEVS-LOOP — Learnings (Auto-aprendizado)
// Acumula conhecimento a cada sessão e se atualiza sozinho
// ============================================================

const fs = require("fs");
const path = require("path");
const { ensureDir, getHomeConfigDir, getPackageRoot } = require("./paths.cjs");

const LEARNINGS_FILE = path.join(getHomeConfigDir(), "learnings.json");
const CONFIG_FILE = path.join(getHomeConfigDir(), "config.json");
const DEFAULT_CONFIG_FILE = path.join(getPackageRoot(), "config.json");

function ensureConfigSeeded() {
  ensureDir(getHomeConfigDir());

  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(DEFAULT_CONFIG_FILE)) {
    fs.copyFileSync(DEFAULT_CONFIG_FILE, CONFIG_FILE);
  }
}

function load() {
  ensureDir(getHomeConfigDir());
  if (fs.existsSync(LEARNINGS_FILE)) {
    return JSON.parse(fs.readFileSync(LEARNINGS_FILE, "utf8"));
  }
  return {
    version: 1,
    lastUpdated: null,
    sessions: { total: 0, history: [] },
    patterns: {},
    projectStats: {},
    taskTypeStats: {},
    avgTimeByType: {},
    customRules: [],
    knownIssues: [],
    devPreferences: {},
  };
}

function save(data) {
  ensureDir(getHomeConfigDir());
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LEARNINGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ─── Registrar fim de sessão ───
function recordSession(sessionData) {
  const l = load();

  l.sessions.total++;
  l.sessions.history.push({
    date: new Date().toISOString(),
    project: sessionData.project,
    initiative: sessionData.initiative,
    tasksCreated: sessionData.tasksCreated,
    tasksCompleted: sessionData.tasksCompleted,
    totalMinutes: sessionData.totalMinutes || 0,
    tasks: (sessionData.tasks || []).map((t) => ({
      name: t.name,
      type: t.type,
      size: t.size,
      completed: t.completed,
    })),
  });

  // Manter apenas últimas 50 sessões
  if (l.sessions.history.length > 50) {
    l.sessions.history = l.sessions.history.slice(-50);
  }

  // Stats por projeto
  const proj = sessionData.project;
  if (!l.projectStats[proj]) {
    l.projectStats[proj] = { sessions: 0, tasks: 0, totalMinutes: 0 };
  }
  l.projectStats[proj].sessions++;
  l.projectStats[proj].tasks += sessionData.tasksCreated;
  l.projectStats[proj].totalMinutes += sessionData.totalMinutes || 0;

  save(l);
}

// ─── Registrar padrão observado ───
function recordPattern(patternKey, data) {
  const l = load();

  if (!l.patterns[patternKey]) {
    l.patterns[patternKey] = { count: 0, firstSeen: new Date().toISOString(), data: [] };
  }

  l.patterns[patternKey].count++;
  l.patterns[patternKey].lastSeen = new Date().toISOString();
  l.patterns[patternKey].data.push(data);

  // Manter últimos 20 por padrão
  if (l.patterns[patternKey].data.length > 20) {
    l.patterns[patternKey].data = l.patterns[patternKey].data.slice(-20);
  }

  save(l);
}

// ─── Registrar tempo médio por tipo de task ───
function recordTaskTime(taskType, minutes) {
  const l = load();

  if (!l.avgTimeByType[taskType]) {
    l.avgTimeByType[taskType] = { total: 0, count: 0, avg: 0 };
  }

  l.avgTimeByType[taskType].total += minutes;
  l.avgTimeByType[taskType].count++;
  l.avgTimeByType[taskType].avg = Math.round(
    l.avgTimeByType[taskType].total / l.avgTimeByType[taskType].count
  );

  save(l);
}

// ─── Auto-detectar novo projeto ───
function detectNewProject(projectName) {
  ensureConfigSeeded();
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

  // Verificar se já existe (case-insensitive)
  const upper = projectName.toUpperCase();
  for (const key of Object.keys(config.projetos)) {
    if (key.toUpperCase() === upper) return false;
  }

  return true; // É novo
}

// ─── Adicionar projeto ao config ───
function addProject(projectName, projectId) {
  ensureConfigSeeded();
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  config.projetos[projectName] = projectId;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");

  recordPattern("new_project_added", { name: projectName, id: projectId });
  console.log(`📦 Projeto '${projectName}' adicionado ao config.json`);
}

// ─── Registrar preferência do dev ───
function setPreference(key, value) {
  const l = load();
  l.devPreferences[key] = { value, updatedAt: new Date().toISOString() };
  save(l);
}

function getPreference(key) {
  const l = load();
  return l.devPreferences[key]?.value || null;
}

// ─── Registrar regra customizada ───
function addCustomRule(rule) {
  const l = load();
  l.customRules.push({
    rule,
    addedAt: new Date().toISOString(),
    active: true,
  });
  save(l);
  console.log(`📝 Regra adicionada: "${rule}"`);
}

// ─── Registrar issue conhecida ───
function addKnownIssue(issue, resolution) {
  const l = load();
  l.knownIssues.push({
    issue,
    resolution,
    addedAt: new Date().toISOString(),
  });
  save(l);
}

// ─── Gerar contexto para o agente ───
function getContextForAgent(project) {
  const l = load();
  const context = {
    totalSessions: l.sessions.total,
    avgTimeByType: l.avgTimeByType,
    customRules: l.customRules.filter((r) => r.active).map((r) => r.rule),
    devPreferences: l.devPreferences,
    knownIssues: l.knownIssues.slice(-10),
  };

  if (project && l.projectStats[project]) {
    context.projectHistory = l.projectStats[project];
  }

  // Últimas 5 sessões
  context.recentSessions = l.sessions.history.slice(-5);

  return context;
}

module.exports = {
  load,
  save,
  recordSession,
  recordPattern,
  recordTaskTime,
  detectNewProject,
  addProject,
  setPreference,
  getPreference,
  addCustomRule,
  addKnownIssue,
  getContextForAgent,
};
