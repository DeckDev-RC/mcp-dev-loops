// ============================================================
// DEVS-LOOP — Coach (Guia Proativo)
// Observa, questiona e guia o dev — mas NUNCA bloqueia
// A palavra final é SEMPRE do dev
// ============================================================

const session = require("./session.cjs");
const learnings = require("./learnings.cjs");

// ─── Analisar e gerar nudges/alertas ───
function analyze(context = {}) {
  const nudges = [];
  const s = session.loadSession();
  const l = learnings.load();

  if (!s) return nudges;

  // ─── 1. ESCOPO ───
  if (context.currentFile && s.initiative) {
    nudges.push(...checkScope(context, s));
  }

  // ─── 2. TEMPO ───
  nudges.push(...checkTime(s, l));

  // ─── 3. PADRÕES ───
  nudges.push(...checkPatterns(context, s, l));

  // ─── 4. QUALIDADE ───
  nudges.push(...checkQuality(context, s));

  // ─── 5. REGRAS CUSTOMIZADAS ───
  nudges.push(...checkCustomRules(context, l));

  return nudges;
}

// ─── Verificar escopo ───
function checkScope(context, s) {
  const nudges = [];
  const { currentFile, currentAction, filesChanged = [] } = context;

  // Se está mexendo em muitos arquivos fora do padrão da iniciativa
  if (filesChanged.length > 10) {
    nudges.push({
      type: "scope",
      severity: "warning",
      message: `⚠️ Você já mexeu em ${filesChanged.length} arquivos nesta sessão. A iniciativa era "${s.initiative}". Está tudo dentro do escopo ou surgiu algo novo?`,
      suggestion: "Se surgiu algo fora do escopo, considere criar uma task separada para não misturar.",
    });
  }

  return nudges;
}

// ─── Verificar tempo ───
function checkTime(s, l) {
  const nudges = [];
  const timer = session.timerStatus();

  if (timer) {
    // Verificar se está demorando mais que a média para o tipo
    const avgTime = l.avgTimeByType;
    const activeTask = s.taskIds?.find((t) => t.id === timer.taskId);

    if (activeTask?.type && avgTime[activeTask.type]) {
      const avg = avgTime[activeTask.type].avg;
      if (timer.minutes > avg * 2 && timer.minutes > 30) {
        nudges.push({
          type: "time",
          severity: "info",
          message: `⏱️ Você está há ${timer.minutes}min nesta task. A média para ${activeTask.type} é ${avg}min. Está travado em algo?`,
          suggestion: "Se estiver travado, considere: (1) criar um Spike separado, (2) pedir ajuda, ou (3) simplificar o escopo.",
        });
      }
    }

    // Alerta genérico se >60min sem concluir
    if (timer.minutes > 60) {
      nudges.push({
        type: "time",
        severity: "warning",
        message: `⏱️ Já são ${timer.minutes}min na task atual. Talvez seja hora de quebrar em subtarefas menores?`,
        suggestion: "Tasks grandes tendem a ser mal estimadas. Considere concluir o que já funciona e criar uma nova task para o restante.",
      });
    }
  }

  // Sessão muito longa sem pausa
  if (s.startTimestamp) {
    const sessionMinutes = Math.floor((Date.now() - s.startTimestamp) / 60000);
    if (sessionMinutes > 180) {
      nudges.push({
        type: "wellbeing",
        severity: "info",
        message: `☕ Sessão ativa há ${Math.floor(sessionMinutes / 60)}h${sessionMinutes % 60}min. Já fez uma pausa?`,
        suggestion: "Pausas regulares melhoram a qualidade do código. Considere um break de 10min.",
      });
    }
  }

  return nudges;
}

// ─── Verificar padrões ───
function checkPatterns(context, s, l) {
  const nudges = [];

  // Se o dev está criando muitas tasks Bug, algo pode estar errado
  const currentBugs = (s.taskIds || []).filter((t) => t.type === "Bug").length;
  if (currentBugs >= 3) {
    nudges.push({
      type: "pattern",
      severity: "info",
      message: `🐛 Já são ${currentBugs} bugs nesta sessão. Pode ser um sinal de que algo estrutural precisa de atenção.`,
      suggestion: "Considere criar uma task de Refactor para resolver a causa raiz ao invés de corrigir sintomas.",
    });
  }

  // Se o dev está investigando muito sem implementar
  const spikes = (s.taskIds || []).filter((t) => t.type === "Spike").length;
  const features = (s.taskIds || []).filter((t) => t.type === "Feature").length;
  if (spikes >= 3 && features === 0) {
    nudges.push({
      type: "pattern",
      severity: "info",
      message: `🔍 Já foram ${spikes} investigações sem nenhuma Feature implementada. Já tem informação suficiente para começar?`,
      suggestion: "Às vezes é melhor começar com um MVP simples do que investigar todas as possibilidades.",
    });
  }

  // Se tem tasks criadas mas nenhuma concluída
  if (s.tasksCreated >= 5 && s.tasksCompleted === 0) {
    nudges.push({
      type: "pattern",
      severity: "warning",
      message: `📋 ${s.tasksCreated} tasks criadas, nenhuma concluída. Está pulando entre tarefas?`,
      suggestion: "Foco em concluir uma task antes de começar outra. Context switching reduz produtividade.",
    });
  }

  return nudges;
}

// ─── Verificar qualidade ───
function checkQuality(context, s) {
  const nudges = [];

  // Se está criando Feature sem testes
  if (context.hasNewFeature && !context.hasTests) {
    nudges.push({
      type: "quality",
      severity: "suggestion",
      message: "🧪 Feature nova sem testes detectados. Quer que eu crie uma task de QA para validação?",
      suggestion: "Cada Feature deveria ter pelo menos uma task de QA correspondente.",
    });
  }

  // Se não tem Spike mas é algo novo
  if (context.isNewDomain && !context.hasSpikeInSession) {
    nudges.push({
      type: "quality",
      severity: "suggestion",
      message: "🔍 Parece que é a primeira vez trabalhando com isso. Faz sentido criar um Spike primeiro para investigar?",
      suggestion: "Um Spike de 20-30min pode evitar horas de retrabalho.",
    });
  }

  return nudges;
}

// ─── Verificar regras customizadas ───
function checkCustomRules(context, l) {
  const nudges = [];
  const activeRules = l.customRules?.filter((r) => r.active) || [];

  for (const rule of activeRules) {
    nudges.push({
      type: "custom_rule",
      severity: "reminder",
      message: `📌 Lembrete: ${rule.rule}`,
    });
  }

  return nudges;
}

// ─── Formatar nudges para exibição ───
function formatNudges(nudges) {
  if (nudges.length === 0) return "";

  const lines = ["\n┌─ 🧭 DEVS-LOOP Coach ─────────────────────"];

  for (const n of nudges) {
    lines.push(`│ ${n.message}`);
    if (n.suggestion) {
      lines.push(`│   💡 ${n.suggestion}`);
    }
    lines.push("│");
  }

  lines.push("│ → Essas são sugestões. A decisão é sua.");
  lines.push("└───────────────────────────────────────────\n");

  return lines.join("\n");
}

// ─── Mensagem proativa baseada em contexto ───
function getProactiveMessage(context = {}) {
  const nudges = analyze(context);
  return nudges.length > 0 ? formatNudges(nudges) : "";
}

module.exports = {
  analyze,
  formatNudges,
  getProactiveMessage,
  checkScope,
  checkTime,
  checkPatterns,
  checkQuality,
};
