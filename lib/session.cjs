// ============================================================
// DEVS-LOOP — Session Manager
// Estado persiste em .devs-loop/.session.json
// ============================================================

const fs = require("fs");
const path = require("path");
const { ensureDir, getHomeConfigDir, getProjectConfigDir } = require("./paths.cjs");

const SESSION_PATHS = [
  path.join(getProjectConfigDir(), ".session.json"),
  path.join(getHomeConfigDir(), ".session.json"),
];

const LOG_PATHS = [
  path.join(getProjectConfigDir(), ".session.log"),
  path.join(getHomeConfigDir(), ".session.log"),
];

function formatMinutes(totalMinutes = 0) {
  if (!totalMinutes || totalMinutes <= 0) return "0h 0min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min`;
}

function findTaskEntry(sessionData, taskId) {
  return sessionData.taskIds.find((task) => task.id === taskId) || null;
}

function addTrackedMinutes(sessionData, taskId, minutes) {
  if (!taskId || !minutes || minutes <= 0) return;
  const task = findTaskEntry(sessionData, taskId);
  if (!task) return;
  task.minutes = (task.minutes || 0) + minutes;
}

function getSessionPath() {
  const projectDir = path.dirname(SESSION_PATHS[0]);
  try {
    ensureDir(projectDir);
    return SESSION_PATHS[0];
  } catch {
    ensureDir(path.dirname(SESSION_PATHS[1]));
    return SESSION_PATHS[1];
  }
}

function getLogPath() {
  const projectDir = path.dirname(LOG_PATHS[0]);
  try {
    ensureDir(projectDir);
    return LOG_PATHS[0];
  } catch {
    ensureDir(path.dirname(LOG_PATHS[1]));
    return LOG_PATHS[1];
  }
}

function loadSession() {
  const p = getSessionPath();
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return null;
}

function saveSession(data) {
  fs.writeFileSync(getSessionPath(), JSON.stringify(data, null, 2), "utf8");
}

function clearSession() {
  const p = getSessionPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);

  const l = getLogPath();
  if (fs.existsSync(l)) fs.unlinkSync(l);
}

function log(message) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  fs.appendFileSync(getLogPath(), `[${timestamp}] ${message}\n`, "utf8");
}

function init({ project, projectId, initiative, listId }) {
  const session = {
    project,
    projectId,
    initiative: initiative || "Sessão geral",
    listId,
    startedAt: new Date().toISOString(),
    startTimestamp: Date.now(),
    tasksCreated: 0,
    tasksCompleted: 0,
    taskIds: [],
    activeTask: null,
    timerStart: null,
  };

  saveSession(session);
  log(`SESSION_INIT project=${project} initiative='${session.initiative}'`);
  return session;
}

function addTask(taskId, taskName, meta = {}) {
  const s = loadSession();
  if (!s) return;

  s.tasksCreated++;
  s.taskIds.push({
    id: taskId,
    name: taskName,
    type: meta.type || null,
    size: meta.size || null,
    parent: meta.parent || null,
    listId: meta.listId || s.listId || null,
    createdAt: new Date().toISOString(),
    completed: false,
    minutes: 0,
  });
  saveSession(s);
  log(`TASK_CREATED id=${taskId} name='${taskName}'`);
}

function completeTask(taskId) {
  const s = loadSession();
  if (!s) return;

  const task = s.taskIds.find((t) => t.id === taskId);
  if (task && !task.completed) {
    s.tasksCompleted++;
    task.completed = true;
    task.completedAt = new Date().toISOString();
  }

  // Parar timer se ativo nessa task
  if (s.activeTask === taskId) {
    const elapsed = s.timerStart ? Math.floor((Date.now() - s.timerStart) / 60000) : 0;
    log(`TIMER_STOP task_id=${taskId} minutes=${elapsed}`);
    addTrackedMinutes(s, taskId, elapsed);
    s.activeTask = null;
    s.timerStart = null;
  }

  saveSession(s);
  log(`TASK_COMPLETED id=${taskId}`);
}

function startTimer(taskId) {
  const s = loadSession();
  if (!s) return;

  s.activeTask = taskId;
  s.timerStart = Date.now();
  saveSession(s);
  log(`TIMER_START task_id=${taskId}`);
}

function stopTimer() {
  const s = loadSession();
  if (!s || !s.timerStart) return { minutes: 0, taskId: null };

  const elapsed = Math.floor((Date.now() - s.timerStart) / 60000);
  const taskId = s.activeTask;

  log(`TIMER_STOP task_id=${taskId} minutes=${elapsed}`);

  addTrackedMinutes(s, taskId, elapsed);
  s.activeTask = null;
  s.timerStart = null;
  saveSession(s);

  return { minutes: elapsed, taskId };
}

function timerStatus() {
  const s = loadSession();
  if (!s || !s.timerStart) return null;

  return {
    taskId: s.activeTask,
    minutes: Math.floor((Date.now() - s.timerStart) / 60000),
  };
}

function summary() {
  const s = loadSession();
  if (!s) return null;

  const elapsed = Math.floor((Date.now() - s.startTimestamp) / 60000);
  const trackedMinutes = (s.taskIds || []).reduce((sum, task) => sum + (task.minutes || 0), 0);
  const totalMinutes = trackedMinutes > 0 ? trackedMinutes : elapsed;

  return {
    project: s.project,
    initiative: s.initiative,
    listId: s.listId,
    tasksCreated: s.tasksCreated,
    tasksCompleted: s.tasksCompleted,
    tasksPending: s.tasksCreated - s.tasksCompleted,
    totalMinutes,
    totalTime: formatMinutes(totalMinutes),
    tasks: s.taskIds || [],
    date: new Date().toLocaleDateString("pt-BR"),
  };
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  log,
  init,
  addTask,
  completeTask,
  startTimer,
  stopTimer,
  timerStatus,
  summary,
};
