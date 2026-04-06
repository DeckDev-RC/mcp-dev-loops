#!/usr/bin/env node
// ============================================================
// DEVS-LOOP CLI
// Gestão autônoma de tasks no ClickUp
// Cross-platform: Windows, macOS, Linux, Termux
//
// Uso:
//   node cli.js init --project ATRIO --initiative "Integrar Shopee"
//   node cli.js task --name "Implementar login" --type Feature --size M
//   node cli.js timer start <task_id>
//   node cli.js done <task_id> --comment "Implementado"
//   node cli.js summary
//   node cli.js end
//   node cli.js projects
//   node cli.js install
// ============================================================

const path = require("path");
const fs = require("fs");
const { ensureDir, getHomeConfigDir } = require("./lib/paths.cjs");

// Parse args simples
function parseArgs(args) {
  const parsed = { _: [] };
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      // Coletar valores até o próximo --flag
      const values = [];
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        values.push(args[i]);
        i++;
      }
      parsed[key] = values.length === 1 ? values[0] : values.length === 0 ? true : values;
    } else {
      parsed._.push(args[i]);
      i++;
    }
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
const subcommand = args._[1];

async function main() {
  switch (command) {
    case "server": {
      require("./mcp-server.cjs");
      return;
    }

    // ─── Sessão ───
    case "init": {
      const config = require("./lib/config.cjs");
      const progress = require("./lib/progress.cjs");
      const session = require("./lib/session.cjs");
      const listResolver = require("./lib/listResolver.cjs");

      const project = args.project;
      if (!project) {
        console.error("❌ Projeto obrigatório: --project ATRIO");
        process.exit(1);
      }

      const projectId = config.resolveProject(project);
      if (!projectId) {
        console.error(`❌ Projeto '${project}' não encontrado. Use: devs-loop projects`);
        process.exit(1);
      }

      let resolvedList;
      try {
        resolvedList = await listResolver.resolveList({
          project,
          explicitListId: args.list,
          allowPrompt: true,
        });
      } catch (error) {
        console.error(`Erro: ${error.message}`);
        process.exit(1);
      }

      const listId = resolvedList.listId;
      const s = session.init({
        project,
        projectId,
        initiative: args.initiative,
        listId,
      });

      console.log("✅ Sessão iniciada");
      console.log(`📋 Projeto: ${project}`);
      console.log(`📋 Iniciativa: ${s.initiative}`);
      if (resolvedList.list) {
        console.log(`📋 Lista: ${listResolver.formatListPath(resolvedList.list)} (${listId})`);
      } else {
        console.log(`📋 Lista: ${listId}`);
      }

      const recent = progress.loadRecentSessions(project, s.initiative, 2);
      const recentText = progress.formatRecentSessions(recent);
      if (recentText) {
        console.log("");
        console.log(recentText);
      }
      break;
    }

    case "end": {
      const learn = require("./lib/learnings.cjs");
      const listResolver = require("./lib/listResolver.cjs");
      const progress = require("./lib/progress.cjs");
      const session = require("./lib/session.cjs");
      const task = require("./lib/task.cjs");

      // Parar timer ativo
      await task.stopTimer();

      // Mostrar resumo
      const s = session.summary();
      if (s) {
        const recentList = s.listId ? await listResolver.getListById(s.listId) : null;
        if (recentList) {
          s.listPath = listResolver.formatListPath(recentList);
        }

        console.log("");
        console.log(`📊 Resumo da Sessão — ${s.date}`);
        console.log("━".repeat(40));
        console.log(`Projeto:          ${s.project}`);
        console.log(`Iniciativa:       ${s.initiative}`);
        console.log(`Tasks criadas:    ${s.tasksCreated}`);
        console.log(`Tasks concluídas: ${s.tasksCompleted}`);
        console.log(`Tasks pendentes:  ${s.tasksPending}`);
        console.log(`Tempo total:      ${s.totalTime}`);
        console.log("━".repeat(40));

        if (s.tasks.length > 0) {
          console.log("");
          for (const t of s.tasks) {
            const icon = t.completed ? "✅" : "⏳";
            console.log(`  ${icon} ${t.name}`);
          }
        }
        console.log("");

        progress.appendSession(s);
        learn.recordSession({
          project: s.project,
          initiative: s.initiative,
          tasksCreated: s.tasksCreated,
          tasksCompleted: s.tasksCompleted,
          totalMinutes: s.totalMinutes || 0,
          tasks: (s.tasks || []).map((taskItem) => ({
            name: taskItem.name,
            type: taskItem.type,
            size: taskItem.size,
            completed: taskItem.completed,
            minutes: taskItem.minutes || 0,
          })),
        });

        for (const taskItem of s.tasks || []) {
          if (taskItem.completed && taskItem.type && (taskItem.minutes || 0) > 0) {
            learn.recordTaskTime(taskItem.type, taskItem.minutes);
          }
        }
      }

      session.clearSession();
      console.log("✅ Sessão encerrada");
      break;
    }

    case "summary": {
      const session = require("./lib/session.cjs");
      const s = session.summary();
      if (!s) {
        console.log("⚠️  Nenhuma sessão ativa");
        break;
      }

      console.log("");
      console.log(`📊 Resumo da Sessão — ${s.date}`);
      console.log("━".repeat(40));
      console.log(`Projeto:          ${s.project}`);
      console.log(`Iniciativa:       ${s.initiative}`);
      console.log(`Tasks criadas:    ${s.tasksCreated}`);
      console.log(`Tasks concluídas: ${s.tasksCompleted}`);
      console.log(`Tasks pendentes:  ${s.tasksPending}`);
      console.log(`Tempo total:      ${s.totalTime}`);
      console.log("━".repeat(40));

      if (s.tasks.length > 0) {
        console.log("");
        for (const t of s.tasks) {
          const icon = t.completed ? "✅" : "⏳";
          console.log(`  ${icon} ${t.name}`);
        }
      }

      const session2 = require("./lib/session.cjs");
      const timer = session2.timerStatus();
      if (timer) {
        console.log("");
        console.log(`⏱️  Timer ativo: ${timer.minutes}min na task ${timer.taskId}`);
      }
      console.log("");
      break;
    }

    // ─── Tasks ───
    case "task": {
      const task = require("./lib/task.cjs");

      const checklist = args.checklist
        ? Array.isArray(args.checklist) ? args.checklist : [args.checklist]
        : [];

      const result = await task.createTask({
        name: args.name,
        type: args.type || "Feature",
        size: args.size || "P",
        project: args.project,
        description: args.desc || args.description,
        checklist,
        listId: args.list,
        parent: args.parent,
        assignee: args.assignee,
      });

      const shouldStartTimer = result && !args["no-timer"];
      if (shouldStartTimer) {
        await task.startTimer(result.id);
      }
      break;
    }

    case "done": {
      const task = require("./lib/task.cjs");
      const taskId = subcommand || args.task;

      if (!taskId) {
        console.error("❌ Task ID obrigatório: devs-loop done <task_id>");
        process.exit(1);
      }

      await task.completeTask(taskId, args.comment);
      break;
    }

    // ─── Attach ───
    case "attach": {
      const https = require("https");
      const { loadEnv } = require("./lib/api.cjs");
      const taskId = subcommand || args.task;
      const filePath = args.file || args._[2];
      if (!taskId) return console.error("❌ Task ID obrigatório: devs-loop attach <task_id> --file caminho/arquivo.ext");
      if (!filePath) return console.error("❌ Arquivo obrigatório: --file caminho/arquivo.ext");
      if (!fs.existsSync(filePath)) return console.error(`❌ Arquivo não encontrado: ${filePath}`);

      loadEnv();

      const fileName = path.basename(filePath);
      const fileContent = fs.readFileSync(filePath);
      const boundary = "----DevsLoop" + Date.now();

      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="attachment"; filename="${fileName}"\r\n`,
        `Content-Type: application/octet-stream\r\n\r\n`,
      ];
      const bodyEnd = `\r\n--${boundary}--\r\n`;

      const payload = Buffer.concat([
        Buffer.from(bodyParts.join("")),
        fileContent,
        Buffer.from(bodyEnd),
      ]);

      const TOKEN = process.env.CLICKUP_API_TOKEN;
      if (!TOKEN) {
        console.error("❌ CLICKUP_API_TOKEN não definido.");
        console.error("   Configure o token em devs-loop-cjs/.env, .devs-loop/.env ou .env.");
        process.exit(1);
      }

      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: "api.clickup.com",
          path: `/api/v2/task/${taskId}/attachment`,
          method: "POST",
          headers: {
            Authorization: TOKEN,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": payload.length,
          },
        }, (res) => {
          let d = ""; res.on("data", (c) => d += c);
          res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
      });

      if (result?.attachment?.url || result?.id) {
        console.log(`📎 Anexo "${fileName}" adicionado à task ${taskId}`);
      } else {
        console.error("❌ Falha ao anexar:", result?.err || result?.message || "erro");
      }
      break;
    }

    case "projects": {
      const config = require("./lib/config.cjs");
      console.log("📋 Projetos disponíveis:");
      for (const p of config.listProjects()) {
        console.log(`  → ${p}`);
      }
      break;
    }

    // ─── Timer ───
    case "timer": {
      const task = require("./lib/task.cjs");
      const session = require("./lib/session.cjs");

      switch (subcommand) {
        case "start": {
          const taskId = args._[2];
          if (!taskId) {
            console.error("❌ Task ID obrigatório: devs-loop timer start <task_id>");
            process.exit(1);
          }
          await task.startTimer(taskId);
          break;
        }
        case "stop": {
          await task.stopTimer();
          break;
        }
        case "status": {
          const t = session.timerStatus();
          if (t) {
            console.log(`⏱️  Timer ativo: ${t.minutes}min na task ${t.taskId}`);
          } else {
            console.log("📋 Nenhum timer ativo");
          }
          break;
        }
        default:
          console.log("Uso: devs-loop timer {start <id>|stop|status}");
      }
      break;
    }

    // ─── Install ───
    case "install": {
      const projectRoot = findProjectRoot();
      const mdSource = path.join(__dirname, "devs-loop.md");
      const packageConfigSource = path.join(__dirname, "config.json");
      const packageEnvExampleSource = path.join(__dirname, ".env.example");
      const homeConfigDir = ensureDir(getHomeConfigDir());
      const homeConfigTarget = path.join(homeConfigDir, "config.json");
      const homeEnvExampleTarget = path.join(homeConfigDir, ".env.example");
      const homeProgressTarget = path.join(homeConfigDir, "devs-loop-progress.md");
      const homeLearningsTarget = path.join(homeConfigDir, "learnings.json");
      const homeReadmeTarget = path.join(homeConfigDir, "README.txt");

      if (!fs.existsSync(mdSource)) {
        console.error("❌ devs-loop.md não encontrado");
        process.exit(1);
      }

      console.log(`📦 Instalando DEVS-LOOP em: ${projectRoot}`);
      const md = fs.readFileSync(mdSource, "utf8");

      if (!fs.existsSync(homeConfigTarget) && fs.existsSync(packageConfigSource)) {
        fs.copyFileSync(packageConfigSource, homeConfigTarget);
        console.log(`  ✅ ${homeConfigTarget}`);
      } else if (fs.existsSync(homeConfigTarget)) {
        console.log(`  ↺ ${homeConfigTarget}`);
      }

      if (!fs.existsSync(homeEnvExampleTarget) && fs.existsSync(packageEnvExampleSource)) {
        fs.copyFileSync(packageEnvExampleSource, homeEnvExampleTarget);
        console.log(`  ✅ ${homeEnvExampleTarget}`);
      } else if (fs.existsSync(homeEnvExampleTarget)) {
        console.log(`  ↺ ${homeEnvExampleTarget}`);
      }

      if (!fs.existsSync(homeProgressTarget)) {
        fs.writeFileSync(
          homeProgressTarget,
          "# DEVS-LOOP Progress\n\nLog append-only das sessoes de desenvolvimento.\n",
          "utf8"
        );
        console.log(`  ✅ ${homeProgressTarget}`);
      } else {
        console.log(`  ↺ ${homeProgressTarget}`);
      }

      if (!fs.existsSync(homeLearningsTarget)) {
        fs.writeFileSync(
          homeLearningsTarget,
          JSON.stringify({
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
          }, null, 2),
          "utf8"
        );
        console.log(`  ✅ ${homeLearningsTarget}`);
      } else {
        console.log(`  ↺ ${homeLearningsTarget}`);
      }

      if (!fs.existsSync(homeReadmeTarget)) {
        fs.writeFileSync(
          homeReadmeTarget,
          [
            "Pasta pessoal do devs-loop-mcp.",
            "Arquivos esperados:",
            "- config.json",
            "- .env.example",
            "- .env (criar manualmente com CLICKUP_API_TOKEN e DEV_EMAIL)",
            "- learnings.json",
            "- devs-loop-progress.md",
          ].join("\n"),
          "utf8"
        );
        console.log(`  ✅ ${homeReadmeTarget}`);
      } else {
        console.log(`  ↺ ${homeReadmeTarget}`);
      }

      // Claude Code
      fs.writeFileSync(path.join(projectRoot, "CLAUDE.md"), md);
      console.log("  ✅ CLAUDE.md");

      // Codex
      fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), md);
      console.log("  ✅ AGENTS.md");

      // Cursor
      fs.writeFileSync(path.join(projectRoot, ".cursorrules"), md);
      console.log("  ✅ .cursorrules");

      // Windsurf
      fs.writeFileSync(path.join(projectRoot, ".windsurfrules"), md);
      console.log("  ✅ .windsurfrules");

      // Antigravity
      const skillDir = path.join(projectRoot, ".agents", "skills", "devs-loop");
      fs.mkdirSync(skillDir, { recursive: true });
      const skillContent = [
        "---",
        "name: devs-loop",
        "description: Gestão autônoma de tasks no ClickUp durante sessões de desenvolvimento.",
        "---",
        "",
        md,
      ].join("\n");
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
      console.log("  ✅ .agents/skills/devs-loop/SKILL.md (Antigravity)");

      console.log("");
      console.log("📁 Config pessoal do pacote:");
      console.log(`  → ${homeConfigDir}`);
      console.log("");
      console.log("✅ DEVS-LOOP instalado para todas as IDEs!");
      break;
    }

    // ─── Coach (orientação proativa) ───
    case "coach": {
      const coach = require("./lib/coach.cjs");
      if (subcommand === "check") {
        const context = {
          currentFile: args.file,
          filesChanged: args.files ? (Array.isArray(args.files) ? args.files : [args.files]) : [],
          hasNewFeature: args.feature === true,
          hasTests: args.tests === true,
          isNewDomain: args.new === true,
        };
        const msg = coach.getProactiveMessage(context);
        console.log(msg || "✅ Tudo em ordem. Segue firme!");
      } else {
        const nudges = coach.analyze({});
        console.log(nudges.length === 0 ? "✅ Sem alertas." : coach.formatNudges(nudges));
      }
      break;
    }

    // ─── Learn (auto-aprendizado) ───
    case "learn": {
      const learn = require("./lib/learnings.cjs");
      switch (subcommand) {
        case "rule": {
          const text = args._.slice(2).join(" ") || args.rule;
          if (!text) { console.log('Uso: devs-loop learn rule "texto"'); break; }
          learn.addCustomRule(text);
          break;
        }
        case "preference": {
          const k = args._[2], v = args._[3];
          if (!k || !v) { console.log("Uso: devs-loop learn preference chave valor"); break; }
          learn.setPreference(k, v);
          console.log(`✅ Preferência: ${k} = ${v}`);
          break;
        }
        case "issue": {
          const issue = args.issue || args._[2];
          if (!issue) { console.log("Uso: devs-loop learn issue --issue 'desc'"); break; }
          learn.addKnownIssue(issue, args.resolution || "");
          console.log("✅ Issue registrada");
          break;
        }
        case "stats": {
          const l = learn.load();
          console.log(`\n📊 Knowledge Base`);
          console.log("━".repeat(35));
          console.log(`Sessões: ${l.sessions.total}`);
          console.log(`Regras:  ${l.customRules?.length || 0}`);
          console.log(`Issues:  ${l.knownIssues?.length || 0}`);
          if (Object.keys(l.avgTimeByType).length > 0) {
            console.log("\n⏱️  Tempo médio por tipo:");
            for (const [t, d] of Object.entries(l.avgTimeByType)) console.log(`  ${t}: ${d.avg}min`);
          }
          if (Object.keys(l.projectStats).length > 0) {
            console.log("\n📁 Projetos:");
            for (const [p, s] of Object.entries(l.projectStats).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 10))
              console.log(`  ${p}: ${s.sessions} sessões`);
          }
          if (l.customRules?.filter(r => r.active).length > 0) {
            console.log("\n📌 Regras:");
            for (const r of l.customRules.filter(r => r.active)) console.log(`  → ${r.rule}`);
          }
          console.log("");
          break;
        }
        case "context": {
          console.log(JSON.stringify(learn.getContextForAgent(args.project), null, 2));
          break;
        }
        default:
          console.log("Uso: devs-loop learn {rule|preference|issue|stats|context}");
      }
      break;
    }

    // ─── Sync (sincronizar com ClickUp) ───
    case "sync": {
      const { api } = require("./lib/api.cjs");
      const cfg = require("./lib/config.cjs").load();
      console.log("🔄 Sincronizando...");
      try {
        const res = await api.get(`/list/${cfg.default_list}/field`);
        if (res.data?.fields) {
          console.log(`  📋 ${res.data.fields.length} custom fields`);
          for (const f of res.data.fields) {
            const known = Object.values(cfg.custom_fields);
            if (!known.includes(f.id)) console.log(`  ⚠️ Não mapeado: "${f.name}" (${f.id})`);
          }
        }
        console.log("✅ Sync concluído");
      } catch (e) { console.error("❌", e.message); }
      break;
    }

    // ─── Help ───
    default: {
      console.log("");
      console.log("  ╔══════════════════════════════════════════════╗");
      console.log("  ║          DEVS-LOOP CLI v2.0                  ║");
      console.log("  ║   Gestão autônoma de tasks no ClickUp        ║");
      console.log("  ║   Cross-platform: Win / Mac / Linux / Termux ║");
      console.log("  ╚══════════════════════════════════════════════╝");
      console.log("");
      console.log("  Sessão:");
      console.log("    init        Iniciar sessão de desenvolvimento");
      console.log("    end         Encerrar sessão e gerar resumo");
      console.log("    summary     Ver resumo da sessão atual");
      console.log("");
      console.log("  Tasks:");
      console.log("    task        Criar task no ClickUp");
      console.log("    done        Marcar task como concluída");
      console.log("    attach      Anexar arquivo à task");
      console.log("    projects    Listar projetos disponíveis");
      console.log("");
      console.log("  Timer:");
      console.log("    timer start <id>   Iniciar timer");
      console.log("    timer stop         Parar timer");
      console.log("    timer status       Ver timer ativo");
      console.log("");
      console.log("  Coach:");
      console.log("    coach              Ver alertas e sugestões");
      console.log("    coach check        Analisar contexto atual");
      console.log("");
      console.log("  Aprendizado:");
      console.log('    learn rule "..."    Adicionar regra customizada');
      console.log("    learn preference   Salvar preferência do dev");
      console.log("    learn issue        Registrar issue conhecida");
      console.log("    learn stats        Ver knowledge base");
      console.log("    learn context      Exportar contexto (JSON)");
      console.log("");
      console.log("  Setup:");
      console.log("    server      Iniciar o servidor MCP local");
      console.log("    install     Distribuir regras para IDEs");
      console.log("    sync        Sincronizar com ClickUp");
      console.log("");
    }
  }
}

function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
