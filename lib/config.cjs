// ============================================================
// DEVS-LOOP — Config Loader
// Carrega config.json e resolve IDs por nome
// ============================================================

const fs = require("fs");
const path = require("path");
const { getHomeConfigDir, getPackageRoot, getProjectConfigDir } = require("./paths.cjs");

const CONFIG_PATHS = [
  path.join(getProjectConfigDir(), "config.json"),
  path.join(getHomeConfigDir(), "config.json"),
  path.join(getPackageRoot(), "config.json"),
];

let _config = null;

function load() {
  if (_config) return _config;

  for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) {
      _config = JSON.parse(fs.readFileSync(p, "utf8"));
      return _config;
    }
  }

  console.error("❌ config.json não encontrado");
  process.exit(1);
}

function get(key) {
  const cfg = load();
  return key.split(".").reduce((obj, k) => obj?.[k], cfg);
}

// Resolvedores de ID por nome legível
function resolveProject(name) {
  const cfg = load();
  const upper = name.toUpperCase();

  // Busca exata
  if (cfg.projetos[name]) return cfg.projetos[name];

  // Busca case-insensitive
  for (const [key, val] of Object.entries(cfg.projetos)) {
    if (key.toUpperCase() === upper) return val;
  }

  return null;
}

function resolveProjectList(name) {
  const cfg = load();
  const mapping = cfg.project_lists || {};
  const upper = name.toUpperCase();

  if (mapping[name]) {
    return typeof mapping[name] === "string" ? mapping[name] : mapping[name]?.id || null;
  }

  for (const [key, val] of Object.entries(mapping)) {
    if (key.toUpperCase() === upper) {
      return typeof val === "string" ? val : val?.id || null;
    }
  }

  return null;
}

function resolveSize(size) {
  const cfg = load();
  return cfg.labels?.tamanho?.[size] || null;
}

function resolveTypeLabel(taskType) {
  const cfg = load();
  const mapping = cfg.task_type_mapping?.[taskType];
  if (!mapping) return null;
  return cfg.labels?.tipos_tarefas?.[mapping.label] || null;
}

function resolveStructure(taskType) {
  const cfg = load();
  const mapping = cfg.task_type_mapping?.[taskType];
  if (!mapping?.estrutura) return null;
  return cfg.labels?.estrutura?.[mapping.estrutura] || null;
}

function listProjects() {
  const cfg = load();
  return Object.keys(cfg.projetos).sort();
}

module.exports = {
  load,
  get,
  resolveProject,
  resolveProjectList,
  resolveSize,
  resolveTypeLabel,
  resolveStructure,
  listProjects,
};
