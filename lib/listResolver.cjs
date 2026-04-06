// ============================================================
// DEVS-LOOP - Smart ClickUp list resolution
// If the user does not pass --list, discover candidates, suggest
// the best one, and ask for confirmation before proceeding.
// ============================================================

const readline = require("readline");
const config = require("./config.cjs");
const { api } = require("./api.cjs");

let cachedLists = null;

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatListPath(list) {
  const folder = list.folder || "Sem pasta";
  return `${list.space} / ${folder} / ${list.name}`;
}

function formatListOption(list, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  return `${formatListPath(list)} [${list.id}]${suffix}`;
}

async function loadAllLists() {
  if (cachedLists) return cachedLists;

  const cfg = config.load();
  const spacesRes = await api.get(`/team/${cfg.workspace_id}/space`);
  const spaces = spacesRes.data?.spaces || [];
  const lists = [];

  for (const space of spaces) {
    const foldersRes = await api.get(`/space/${space.id}/folder`);
    const folders = foldersRes.data?.folders || [];

    for (const folder of folders) {
      const listsRes = await api.get(`/folder/${folder.id}/list`);
      const folderLists = listsRes.data?.lists || [];

      for (const list of folderLists) {
        lists.push({
          id: String(list.id),
          name: list.name,
          folder: folder.name,
          space: space.name,
        });
      }
    }

    const folderlessRes = await api.get(`/space/${space.id}/list`);
    const folderlessLists = folderlessRes.data?.lists || [];

    for (const list of folderlessLists) {
      lists.push({
        id: String(list.id),
        name: list.name,
        folder: null,
        space: space.name,
      });
    }
  }

  cachedLists = lists;
  return lists;
}

async function getListById(listId) {
  const lists = await loadAllLists();
  return lists.find((item) => String(item.id) === String(listId)) || null;
}

function scoreCandidate(project, list) {
  const projectNorm = normalize(project);
  const listNorm = normalize(list.name);
  const folderNorm = normalize(list.folder || "");
  const spaceNorm = normalize(list.space || "");
  let score = 0;
  const reasons = [];

  if (!projectNorm) return { score, reasons };

  if (listNorm === projectNorm) {
    score += 160;
    reasons.push("nome exato");
  }

  if (listNorm.startsWith(projectNorm) && listNorm !== projectNorm) {
    score += 120;
    reasons.push("nome comeca pelo projeto");
  }

  if (listNorm.includes(projectNorm) && !reasons.includes("nome comeca pelo projeto")) {
    score += 90;
    reasons.push("nome contem projeto");
  }

  if (projectNorm.includes(listNorm) && listNorm.length >= 4 && listNorm !== projectNorm) {
    score += 35;
    reasons.push("nome da lista contido no projeto");
  }

  if (folderNorm.includes(projectNorm) && projectNorm.length >= 3) {
    score += 30;
    reasons.push("pasta contem projeto");
  }

  if (spaceNorm.includes(projectNorm) && projectNorm.length >= 3) {
    score += 12;
    reasons.push("espaco contem projeto");
  }

  if (folderNorm === "produtos") {
    score += 8;
    reasons.push("pasta Produtos");
  }

  if (folderNorm === "modelo") {
    score -= 30;
    reasons.push("penalidade pasta Modelo");
  }

  return { score, reasons };
}

function mergeCandidate(candidateMap, list, patch = {}) {
  if (!list) return;

  const existing = candidateMap.get(list.id) || {
    id: list.id,
    name: list.name,
    folder: list.folder,
    space: list.space,
    score: 0,
    reasons: [],
    tags: [],
    recommended: false,
    source: "inference",
  };

  existing.score += patch.score || 0;
  existing.reasons = Array.from(new Set([...existing.reasons, ...(patch.reasons || [])]));
  existing.tags = Array.from(new Set([...existing.tags, ...(patch.tags || [])]));
  existing.recommended = existing.recommended || !!patch.recommended;
  if (existing.recommended && existing.source === "project_config" && patch.source === "inference") {
    existing.source = "project_config";
  } else {
    existing.source = patch.source || existing.source;
  }

  candidateMap.set(list.id, existing);
}

async function buildCandidates(project) {
  const lists = await loadAllLists();
  const candidateMap = new Map();

  const projectListId = config.resolveProjectList(project);
  if (projectListId) {
    const mappedList = await getListById(projectListId);
    mergeCandidate(candidateMap, mappedList, {
      score: 500,
      reasons: ["mapeada para o projeto em config"],
      tags: ["recomendada", "config"],
      recommended: true,
      source: "project_config",
    });
  }

  for (const list of lists) {
    const ranking = scoreCandidate(project, list);
    if (ranking.score <= 0) continue;

    mergeCandidate(candidateMap, list, {
      score: ranking.score,
      reasons: ranking.reasons,
      source: "inference",
    });
  }

  return Array.from(candidateMap.values()).sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );
}

function pickRecommended(candidates) {
  if (candidates.length === 0) return null;

  const explicitRecommendation = candidates.find((item) => item.recommended);
  if (explicitRecommendation) return explicitRecommendation;

  const top = candidates[0];
  const second = candidates[1];
  const gap = second ? top.score - second.score : top.score;

  if (top.score >= 120) return top;
  if (top.score >= 90 && gap >= 20) return top;
  if (top.score >= 70 && !second) return top;

  return top;
}

function askQuestion(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptForList(project, candidates, defaultList) {
  const recommended = pickRecommended(candidates);
  const options = candidates.slice(0, 8);

  console.log("");
  console.log(`Listas encontradas para "${project}":`);

  if (recommended) {
    console.log(`Sugestao: ${formatListOption(recommended, "[recomendada]")}`);
  } else if (defaultList) {
    console.log(`Sugestao fraca: ${formatListOption(defaultList, "[padrao configurada]")}`);
  } else {
    console.log("Nao encontrei uma sugestao forte o suficiente.");
  }

  if (options.length > 0) {
    console.log("Opcoes:");
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const badges = [];
      if (recommended && option.id === recommended.id) badges.push("recomendada");
      for (const tag of option.tags || []) {
        if (!badges.includes(tag)) badges.push(tag);
      }
      const reasons = option.reasons.length > 0 ? ` - ${option.reasons.join(", ")}` : "";
      const badgeText = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
      console.log(`  ${index + 1}. ${formatListPath(option)} [${option.id}]${badgeText}${reasons}`);
    }
  }

  if (defaultList && !options.some((item) => item.id === defaultList.id)) {
    console.log(`  D. ${formatListOption(defaultList, "[padrao configurada]")}`);
  }

  console.log("  X. Cancelar");
  console.log("");

  while (true) {
    const answer = (await askQuestion("Confirme a lista desejada (numero, Enter, D ou X): ")).toLowerCase();

    if (answer === "" && recommended) {
      return {
        listId: recommended.id,
        source: "prompt_recommended",
        list: recommended,
      };
    }

    if (answer === "x") {
      throw new Error("Criacao cancelada. Informe --list manualmente ou confirme uma lista.");
    }

    if (answer === "d" && defaultList) {
      return {
        listId: defaultList.id,
        source: "prompt_default",
        list: defaultList,
      };
    }

    const selectedIndex = Number(answer);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.length) {
      const selected = options[selectedIndex - 1];
      return {
        listId: selected.id,
        source: "prompt",
        list: selected,
      };
    }

    console.log("Entrada invalida. Use Enter para aceitar a recomendada, escolha um numero, D ou X.");
  }
}

function isInteractivePromptAvailable(allowPrompt) {
  return allowPrompt && process.stdin.isTTY && process.stdout.isTTY;
}

function buildAmbiguousError(project, candidates, defaultList) {
  const candidateLines = candidates
    .slice(0, 5)
    .map((item) => `  - ${formatListOption(item)} (score ${item.score})`)
    .join("\n");

  const defaultLine = defaultList
    ? `\nLista padrao atual: ${formatListOption(defaultList)}`
    : "";

  return (
    `Lista nao confirmada para o projeto "${project}". Rode em terminal interativo ou informe --list.` +
    (candidateLines ? `\nCandidatas encontradas:\n${candidateLines}` : "") +
    defaultLine
  );
}

async function resolveList({
  project,
  explicitListId,
  sessionListId,
  allowPrompt = true,
}) {
  if (explicitListId) {
    const explicitList = await getListById(explicitListId);
    return {
      listId: String(explicitListId),
      source: "argument",
      list: explicitList,
    };
  }

  if (sessionListId) {
    const sessionList = await getListById(sessionListId);
    return {
      listId: String(sessionListId),
      source: "session",
      list: sessionList,
    };
  }

  const candidates = await buildCandidates(project);
  const defaultListId = config.get("default_list");
  const defaultList = defaultListId ? await getListById(defaultListId) : null;

  if (isInteractivePromptAvailable(allowPrompt)) {
    return promptForList(project, candidates, defaultList);
  }

  const recommended = pickRecommended(candidates);
  if (recommended && recommended.recommended) {
    return {
      listId: recommended.id,
      source: recommended.source,
      list: recommended,
    };
  }

  throw new Error(buildAmbiguousError(project, candidates, defaultList));
}

module.exports = {
  buildCandidates,
  formatListPath,
  getListById,
  loadAllLists,
  pickRecommended,
  resolveList,
};
