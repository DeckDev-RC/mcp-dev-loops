// ============================================================
// DEVS-LOOP - Task Operations
// Create, complete and update ClickUp tasks
// ============================================================

const { api } = require("./api.cjs");
const config = require("./config.cjs");
const session = require("./session.cjs");
const listResolver = require("./listResolver.cjs");

let customItemCache = null;

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function getTask(taskId) {
  const res = await api.get(`/task/${taskId}`);
  return res.data || null;
}

async function getList(listId) {
  const res = await api.get(`/list/${listId}`);
  return res.data || null;
}

async function loadCustomItems() {
  if (customItemCache) return customItemCache;

  const cfg = config.load();
  const res = await api.get(`/team/${cfg.workspace_id}/custom_item`);
  customItemCache = res.data?.custom_items || [];
  return customItemCache;
}

async function resolveCustomItemId(taskType) {
  const normalizedTaskType = normalize(taskType);
  const items = await loadCustomItems();
  const match = items.find((item) => normalize(item.name) === normalizedTaskType);
  return match?.id || null;
}

async function ensureCustomFieldValue(taskId, fieldId, value) {
  const res = await api.post(`/task/${taskId}/field/${fieldId}`, { value });
  return res.status >= 200 && res.status < 300;
}

async function ensureCustomFields(taskId, customFields) {
  for (const field of customFields) {
    try {
      await ensureCustomFieldValue(taskId, field.id, field.value);
    } catch (error) {
      console.log(`Warning: could not guarantee custom field ${field.id} on task ${taskId}.`);
    }
  }
}

function flattenChecklistItems(items = []) {
  const flat = [];

  for (const item of items) {
    if (!item) continue;
    flat.push(item);

    if (Array.isArray(item.children) && item.children.length > 0) {
      const nestedObjects = item.children.filter((child) => child && typeof child === "object");
      flat.push(...flattenChecklistItems(nestedObjects));
    }
  }

  return flat;
}

async function resolveNativeChecklists(taskId) {
  const task = await getTask(taskId);
  const checklists = task?.checklists || [];
  let resolvedCount = 0;

  for (const checklist of checklists) {
    const items = flattenChecklistItems(checklist.items || []);
    for (const item of items) {
      if (item.resolved) continue;

      await api.put(`/checklist/${checklist.id}/checklist_item/${item.id}`, {
        resolved: true,
      });
      resolvedCount += 1;
    }
  }

  return resolvedCount;
}

function findMatchingStatus(listData, desiredStatusName) {
  const desired = normalize(desiredStatusName);
  return (listData?.statuses || []).find((status) => normalize(status.status) === desired) || null;
}

function findClosedStatus(listData) {
  return (listData?.statuses || []).find((status) => status.type === "closed") || null;
}

async function resolveStartStatus(taskId, fallbackStatusName) {
  const task = await getTask(taskId);
  const listData = await getList(task.list.id);
  const exact = findMatchingStatus(listData, fallbackStatusName);
  if (exact) return exact.status;

  const inProgress = (listData?.statuses || []).find((status) => normalize(status.status).includes("andamento"));
  return inProgress?.status || null;
}

async function resolveDoneStatus(taskId, fallbackStatusName) {
  const task = await getTask(taskId);
  const listData = await getList(task.list.id);
  const exact = findMatchingStatus(listData, fallbackStatusName);
  if (exact) return exact.status;

  const closed = findClosedStatus(listData);
  return closed?.status || null;
}

function buildMarkdownDescription(description, checklist = []) {
  let md = `**O que deve ser feito?**\n${description || "..."}\n\n`;

  // If we have native checklist support, avoid duplicating criteria in markdown.
  if (checklist.length === 0) {
    md += "**Critérios de Conclusão**\n";
    md += "- [ ] Definir critérios nesta descrição quando não houver checklist nativa disponível.\n\n";
  }

  md += "**Observações**\n...";
  return md;
}

async function createTask({
  name,
  type = "Feature",
  size = "P",
  project,
  description,
  checklist = [],
  listId,
  parent,
  assignee,
}) {
  if (!project) {
    const s = session.loadSession();
    project = s?.project;
  }

  if (!project) {
    console.error("Project not defined. Use --project or start a session.");
    return null;
  }

  const projectId = config.resolveProject(project);
  if (!projectId) {
    console.error(`Project '${project}' not found. Use: devs-loop projects`);
    return null;
  }

  const sizeId = config.resolveSize(size);
  const typeLabelId = config.resolveTypeLabel(type);
  const structureId = config.resolveStructure(type);
  const cfg = config.load();

  const customFields = [];

  if (typeLabelId) {
    customFields.push({
      id: cfg.custom_fields.tipos_tarefas,
      value: [typeLabelId],
    });
  }

  customFields.push({
    id: cfg.custom_fields.projeto_produto,
    value: projectId,
  });

  if (sizeId) {
    customFields.push({
      id: cfg.custom_fields.tamanho_task,
      value: [sizeId],
    });
  }

  if (structureId) {
    customFields.push({
      id: cfg.custom_fields.estrutura_projeto,
      value: structureId,
    });
  }

  if (parent) {
    customFields.push({
      id: cfg.custom_fields.ok,
      value: cfg.labels.ok.SUBTAREFAS,
    });
  } else if (size === "G") {
    customFields.push({
      id: cfg.custom_fields.ok,
      value: cfg.labels.ok.TAREFA_PAI,
    });
  }

  let targetList = listId || session.loadSession()?.listId;

  if (!targetList) {
    try {
      const resolvedList = await listResolver.resolveList({
        project,
        allowPrompt: true,
      });
      targetList = resolvedList.listId;

      if (resolvedList.list) {
        console.log(`Selected list: ${listResolver.formatListPath(resolvedList.list)} (${resolvedList.list.id})`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      return null;
    }
  }

  const payload = {
    name,
    markdown_description: buildMarkdownDescription(description, checklist),
    priority: cfg.default_priority,
    custom_fields: customFields,
  };

  if (parent) payload.parent = parent;
  if (assignee) payload.assignees = [assignee];

  const res = await api.post(`/list/${targetList}/task`, payload);

  if (!res.data?.id) {
    console.error("Failed to create task:", res.data?.err || res.data?.message || "unknown error");
    return null;
  }

  const taskId = res.data.id;
  const taskUrl = res.data.url;

  const customItemId = await resolveCustomItemId(type);
  if (customItemId) {
    await api.put(`/task/${taskId}`, { custom_item_id: customItemId }).catch(() => {});
  }

  await ensureCustomFields(taskId, customFields);

  console.log(`Task created: ${taskUrl}`);
  session.addTask(taskId, name, {
    type,
    size,
    parent: parent || null,
    listId: targetList,
  });

  if (checklist.length > 0) {
    try {
      const clRes = await api.post(`/task/${taskId}/checklist`, {
        name: "Critérios de Conclusão",
      });

      const checklistId = clRes.data?.checklist?.id;
      if (checklistId) {
        for (const item of checklist) {
          await api.post(`/checklist/${checklistId}/checklist_item`, {
            name: item,
          });
        }
        console.log(`Native checklist created with ${checklist.length} items`);
      }
    } catch (error) {
      console.log("Warning: native checklist was not created.");
    }
  }

  return { id: taskId, url: taskUrl };
}

async function completeTask(taskId, comment) {
  const cfg = config.load();

  const timer = session.stopTimer();
  if (timer.minutes > 0) {
    console.log(`Timer stopped: ${timer.minutes}min`);
  }

  try {
    const resolvedCount = await resolveNativeChecklists(taskId);
    if (resolvedCount > 0) {
      console.log(`Native checklist resolved: ${resolvedCount} item(s)`);
    }
  } catch (error) {
    console.log(`Warning: could not resolve native checklist items on task ${taskId}.`);
  }

  const doneStatus = await resolveDoneStatus(taskId, cfg.default_status_done);
  if (doneStatus) {
    await api.put(`/task/${taskId}`, {
      status: doneStatus,
    });
  }

  if (comment) {
    await api.post(`/task/${taskId}/comment`, {
      comment_text: `✅ ${comment}`,
    });
  }

  session.completeTask(taskId);
  console.log(`Task ${taskId} completed`);
}

async function startTimer(taskId) {
  const cfg = config.load();
  const currentTimer = session.timerStatus();

  if (currentTimer?.taskId === taskId) {
    console.log(`Timer already active for task ${taskId}`);
    return;
  }

  if (currentTimer?.taskId && currentTimer.taskId !== taskId) {
    await stopTimer();
  }

  await api.post(`/team/${cfg.workspace_id}/time_entries/start`, {
    tid: taskId,
  }).catch(() => {});

  const startStatus = await resolveStartStatus(taskId, cfg.default_status_start);
  if (startStatus) {
    await api.put(`/task/${taskId}`, {
      status: startStatus,
    }).catch(() => {});
  }

  session.startTimer(taskId);
  console.log(`Timer started for task ${taskId}`);
}

async function stopTimer() {
  const cfg = config.load();

  await api.post(`/team/${cfg.workspace_id}/time_entries/stop`, {}).catch(() => {});

  const result = session.stopTimer();
  if (result.taskId) {
    console.log(`Timer stopped: ${result.minutes}min (task: ${result.taskId})`);
  } else {
    console.log("No active timer");
  }
  return result;
}

module.exports = { createTask, completeTask, startTimer, stopTimer };
