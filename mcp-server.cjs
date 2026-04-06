#!/usr/bin/env node
// ============================================================
// DEVS-LOOP MCP SERVER
// Exposes the devs-loop core as a personal MCP server over stdio
// ============================================================

const util = require("util");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const config = require("./lib/config.cjs");
const learnings = require("./lib/learnings.cjs");
const listResolver = require("./lib/listResolver.cjs");
const progress = require("./lib/progress.cjs");
const session = require("./lib/session.cjs");
const task = require("./lib/task.cjs");

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function writeStderr(prefix, args) {
  const message = util.format(...args);
  process.stderr.write(`${prefix}${message}\n`);
}

console.log = (...args) => writeStderr("[devs-loop] ", args);
console.error = (...args) => writeStderr("[devs-loop:error] ", args);

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function createResponse(summary, data) {
  const text = typeof summary === "string" ? summary : asText(summary);
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    structuredContent: data ?? (typeof summary === "string" ? undefined : summary),
  };
}

async function runCaptured(fn) {
  const logs = [];
  const prevLog = console.log;
  const prevError = console.error;

  console.log = (...args) => logs.push({ level: "info", message: util.format(...args) });
  console.error = (...args) => logs.push({ level: "error", message: util.format(...args) });

  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = prevLog;
    console.error = prevError;
  }
}

async function withToolCapture(fn) {
  try {
    const { result, logs } = await runCaptured(fn);
    return { ok: true, result, logs };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      logs: [],
    };
  }
}

function mergeTextAndLogs(summary, logs = []) {
  if (!logs || logs.length === 0) return summary;
  return `${summary}\n\nLogs:\n${logs.map((entry) => `- [${entry.level}] ${entry.message}`).join("\n")}`;
}

const server = new McpServer({
  name: "devs-loop-mcp",
  version: "1.0.0",
});

server.registerTool(
  "devs_loop_projects",
  {
    title: "Listar projetos do devs-loop",
    description: "Lista os projetos conhecidos no config do devs-loop.",
    inputSchema: {},
  },
  async () => {
    const projects = config.listProjects();
    return createResponse(
      `Projetos disponíveis:\n${projects.map((project) => `- ${project}`).join("\n")}`,
      { projects }
    );
  }
);

server.registerTool(
  "devs_loop_suggest_list",
  {
    title: "Sugerir lista do ClickUp",
    description: "Mapeia as listas reais do ClickUp e sugere as melhores opções para um projeto.",
    inputSchema: {
      project: z.string(),
      limit: z.number().int().positive().max(10).optional(),
    },
  },
  async ({ project, limit = 5 }) => {
    const candidates = await listResolver.buildCandidates(project);
    const recommended = listResolver.pickRecommended(candidates);
    const output = {
      project,
      recommended: recommended
        ? {
            id: recommended.id,
            path: listResolver.formatListPath(recommended),
            score: recommended.score,
            reasons: recommended.reasons,
            source: recommended.source,
          }
        : null,
      candidates: candidates.slice(0, limit).map((candidate) => ({
        id: candidate.id,
        path: listResolver.formatListPath(candidate),
        score: candidate.score,
        reasons: candidate.reasons,
        source: candidate.source,
      })),
    };

    const lines = [];
    if (output.recommended) {
      lines.push(`Sugestao: ${output.recommended.path} (${output.recommended.id})`);
      if (output.recommended.reasons?.length) {
        lines.push(`Motivos: ${output.recommended.reasons.join(", ")}`);
      }
    } else {
      lines.push(`Nenhuma sugestao forte encontrada para ${project}.`);
    }

    if (output.candidates.length > 0) {
      lines.push("");
      lines.push("Candidatas:");
      for (const candidate of output.candidates) {
        lines.push(`- ${candidate.path} (${candidate.id})`);
      }
    }

    return createResponse(lines.join("\n"), output);
  }
);

server.registerTool(
  "devs_loop_recent_progress",
  {
    title: "Consultar progresso recente",
    description: "Lê o devs-loop-progress.md e devolve contexto recente do mesmo projeto ou iniciativa.",
    inputSchema: {
      project: z.string(),
      initiative: z.string().optional(),
      limit: z.number().int().positive().max(10).optional(),
    },
  },
  async ({ project, initiative, limit = 2 }) => {
    const recent = progress.loadRecentSessions(project, initiative, limit);
    const formatted = progress.formatRecentSessions(recent) || `Nenhum progresso recente encontrado para ${project}.`;
    return createResponse(formatted, { project, initiative, sessions: recent });
  }
);

server.registerTool(
  "devs_loop_init_session",
  {
    title: "Iniciar sessão do devs-loop",
    description: "Inicia uma sessão local do devs-loop com projeto, iniciativa e lista do ClickUp.",
    inputSchema: {
      project: z.string(),
      initiative: z.string(),
      listId: z.string().optional(),
    },
  },
  async ({ project, initiative, listId }) => {
    const resolution = await listResolver.resolveList({
      project,
      explicitListId: listId,
      allowPrompt: false,
    });

    const projectId = config.resolveProject(project);
    if (!projectId) {
      throw new Error(`Projeto '${project}' nao encontrado no config do devs-loop.`);
    }

    const current = session.init({
      project,
      projectId,
      initiative,
      listId: resolution.listId,
    });

    const recent = progress.loadRecentSessions(project, initiative, 2);
    const recentText = progress.formatRecentSessions(recent);
    const summary = [
      `Sessao iniciada para ${project}.`,
      `Iniciativa: ${current.initiative}`,
      resolution.list ? `Lista: ${listResolver.formatListPath(resolution.list)} (${resolution.listId})` : `Lista: ${resolution.listId}`,
      recentText ? `\n${recentText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return createResponse(summary, {
      project,
      initiative: current.initiative,
      listId: resolution.listId,
      listPath: resolution.list ? listResolver.formatListPath(resolution.list) : null,
      recent,
    });
  }
);

server.registerTool(
  "devs_loop_create_task",
  {
    title: "Criar task no ClickUp via devs-loop",
    description: "Cria uma task usando as regras do devs-loop e inicia timer por padrão.",
    inputSchema: {
      name: z.string(),
      project: z.string().optional(),
      type: z.enum(["Feature", "Bug", "Infra", "QA", "Refactor", "Doc", "Spike"]).optional(),
      size: z.enum(["P", "M", "G"]).optional(),
      description: z.string().optional(),
      checklist: z.array(z.string()).optional(),
      listId: z.string().optional(),
      parent: z.string().optional(),
      assignee: z.union([z.string(), z.number()]).optional(),
      startTimer: z.boolean().optional(),
    },
  },
  async ({ name, project, type = "Feature", size = "P", description, checklist = [], listId, parent, assignee, startTimer = true }) => {
    const outcome = await withToolCapture(async () => {
      const created = await task.createTask({
        name,
        project,
        type,
        size,
        description,
        checklist,
        listId,
        parent,
        assignee: assignee ? String(assignee) : undefined,
      });

      if (!created) {
        throw new Error("Falha ao criar task no ClickUp.");
      }

      if (startTimer) {
        await task.startTimer(created.id);
      }

      return created;
    });

    if (!outcome.ok) {
      return {
        content: [{ type: "text", text: mergeTextAndLogs(`Erro ao criar task: ${outcome.error}`, outcome.logs) }],
        isError: true,
      };
    }

    return createResponse(
      mergeTextAndLogs(`Task criada com sucesso: ${outcome.result.url}`, outcome.logs),
      {
        task: outcome.result,
        startedTimer: startTimer,
      }
    );
  }
);

server.registerTool(
  "devs_loop_complete_task",
  {
    title: "Concluir task no ClickUp via devs-loop",
    description: "Marca checklist, para timer, conclui a task e registra comentário final.",
    inputSchema: {
      taskId: z.string(),
      comment: z.string().optional(),
    },
  },
  async ({ taskId, comment }) => {
    const outcome = await withToolCapture(async () => {
      await task.completeTask(taskId, comment);
      return { taskId };
    });

    if (!outcome.ok) {
      return {
        content: [{ type: "text", text: mergeTextAndLogs(`Erro ao concluir task: ${outcome.error}`, outcome.logs) }],
        isError: true,
      };
    }

    return createResponse(
      mergeTextAndLogs(`Task concluida: ${taskId}`, outcome.logs),
      { taskId }
    );
  }
);

server.registerTool(
  "devs_loop_timer_status",
  {
    title: "Consultar timer ativo",
    description: "Consulta a task atualmente em andamento no devs-loop.",
    inputSchema: {},
  },
  async () => {
    const current = session.timerStatus();
    if (!current) {
      return createResponse("Nenhum timer ativo.", { active: false });
    }

    return createResponse(
      `Timer ativo: ${current.minutes}min na task ${current.taskId}`,
      { active: true, ...current }
    );
  }
);

server.registerTool(
  "devs_loop_stop_timer",
  {
    title: "Parar timer ativo",
    description: "Para o timer ativo no devs-loop.",
    inputSchema: {},
  },
  async () => {
    const outcome = await withToolCapture(async () => task.stopTimer());
    if (!outcome.ok) {
      return {
        content: [{ type: "text", text: mergeTextAndLogs(`Erro ao parar timer: ${outcome.error}`, outcome.logs) }],
        isError: true,
      };
    }

    const result = outcome.result;
    const summary = result?.taskId
      ? `Timer parado: ${result.minutes}min na task ${result.taskId}`
      : "Nenhum timer ativo.";

    return createResponse(mergeTextAndLogs(summary, outcome.logs), result || { taskId: null, minutes: 0 });
  }
);

server.registerTool(
  "devs_loop_summary",
  {
    title: "Resumo da sessão ativa",
    description: "Retorna o resumo da sessão local atual do devs-loop.",
    inputSchema: {},
  },
  async () => {
    const current = session.summary();
    if (!current) {
      return createResponse("Nenhuma sessao ativa.", { active: false });
    }

    const text = [
      `Projeto: ${current.project}`,
      `Iniciativa: ${current.initiative}`,
      `Tasks criadas: ${current.tasksCreated}`,
      `Tasks concluidas: ${current.tasksCompleted}`,
      `Tasks pendentes: ${current.tasksPending}`,
      `Tempo total: ${current.totalTime}`,
    ].join("\n");

    return createResponse(text, { active: true, summary: current });
  }
);

server.registerTool(
  "devs_loop_end_session",
  {
    title: "Encerrar sessão do devs-loop",
    description: "Fecha a sessão local, gera resumo e persiste no log de progresso.",
    inputSchema: {},
  },
  async () => {
    const current = session.summary();
    if (!current) {
      return createResponse("Nenhuma sessao ativa para encerrar.", { active: false });
    }

    const { result, logs } = await runCaptured(async () => {
      await task.stopTimer();
      const finalSummary = session.summary();
      if (!finalSummary) return null;

      const listData = finalSummary.listId ? await listResolver.getListById(finalSummary.listId) : null;
      if (listData) {
        finalSummary.listPath = listResolver.formatListPath(listData);
      }

      progress.appendSession(finalSummary);
      learnings.recordSession({
        project: finalSummary.project,
        initiative: finalSummary.initiative,
        tasksCreated: finalSummary.tasksCreated,
        tasksCompleted: finalSummary.tasksCompleted,
        totalMinutes: finalSummary.totalMinutes || 0,
        tasks: (finalSummary.tasks || []).map((taskItem) => ({
          name: taskItem.name,
          type: taskItem.type,
          size: taskItem.size,
          completed: taskItem.completed,
          minutes: taskItem.minutes || 0,
        })),
      });

      for (const taskItem of finalSummary.tasks || []) {
        if (taskItem.completed && taskItem.type && (taskItem.minutes || 0) > 0) {
          learnings.recordTaskTime(taskItem.type, taskItem.minutes);
        }
      }

      session.clearSession();
      return finalSummary;
    });

    if (!result) {
      return createResponse("Sessao encerrada sem resumo.", { active: false });
    }

    const summaryText = [
      `Sessao encerrada: ${result.project} | ${result.initiative}`,
      `Tasks criadas: ${result.tasksCreated}`,
      `Tasks concluidas: ${result.tasksCompleted}`,
      `Tasks pendentes: ${result.tasksPending}`,
      `Tempo total: ${result.totalTime}`,
    ].join("\n");

    return createResponse(mergeTextAndLogs(summaryText, logs), { active: false, summary: result });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[devs-loop-mcp] ready\n");
}

main().catch((error) => {
  originalConsoleError("[devs-loop-mcp] fatal", error);
  process.exit(1);
});
