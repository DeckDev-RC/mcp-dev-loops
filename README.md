# DEVS-LOOP MCP

Pacote distribuivel do devs-loop para uso pessoal via MCP e CLI.

## Modos de uso

- CLI local: `devs-loop ...`
- MCP pessoal local: `devs-loop-mcp`

## Servidor MCP

O servidor MCP expoe o core do devs-loop por `stdio`, reaproveitando as regras de:

- resolucao de lista
- criacao de tasks
- controle de timer
- resumo de sessao
- progresso entre sessoes

### Instalar dependencias

```bash
npm install
```

## Estrutura de configuracao

Este pacote foi preparado para funcionar em qualquer maquina sem depender do diretorio do projeto original.

Ordem de resolucao:

1. `./.devs-loop/` no projeto atual
2. `~/.devs-loop/` no usuario atual
3. defaults do pacote publicado

Arquivos pessoais recomendados:

- `~/.devs-loop/.env`
- `~/.devs-loop/config.json`
- `~/.devs-loop/learnings.json`

Exemplo de `~/.devs-loop/.env`:

```env
CLICKUP_API_TOKEN=pk_xxx
DEV_EMAIL=voce@empresa.com
```

### Bootstrap em uma maquina nova

```bash
npx -y @renatocostaguedesdemorais/devs-loop-mcp install
```

Esse comando:

- cria ou reutiliza `~/.devs-loop/`
- copia `config.json` e `.env.example` para o diretorio pessoal se ainda nao existirem
- cria `learnings.json` e `devs-loop-progress.md` quando necessario
- sincroniza no projeto atual:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.cursorrules`
  - `.windsurfrules`
  - `.agents/skills/devs-loop/SKILL.md`

Depois disso, basta preencher `~/.devs-loop/.env` com:

```env
CLICKUP_API_TOKEN=pk_xxx
DEV_EMAIL=voce@empresa.com
```

### Iniciar o servidor MCP

```bash
npx -y @renatocostaguedesdemorais/devs-loop-mcp server
```

Ou:

```bash
npm run mcp
```

### Exemplo de configuracao MCP local

```json
{
  "mcpServers": {
    "devs-loop": {
      "command": "npx",
      "args": [
        "-y",
        "@renatocostaguedesdemorais/devs-loop-mcp",
        "server"
      ]
    }
  }
}
```

### Configuracao pronta nesta maquina

Os dois editores abaixo ja foram configurados nesta maquina para usar o servidor MCP local do devs-loop:

- `C:\Users\Débora\AppData\Roaming\Antigravity\User\settings.json`
- `C:\Users\Débora\AppData\Roaming\Cursor\User\settings.json`

Entrada configurada:

```json
{
  "mcpServers": {
    "devs-loop": {
      "command": "npx",
      "args": [
        "-y",
        "@renatocostaguedesdemorais/devs-loop-mcp",
        "server"
      ]
    }
  }
}
```

### Tools disponiveis

- `devs_loop_projects`
- `devs_loop_suggest_list`
- `devs_loop_recent_progress`
- `devs_loop_init_session`
- `devs_loop_create_task`
- `devs_loop_complete_task`
- `devs_loop_timer_status`
- `devs_loop_stop_timer`
- `devs_loop_summary`
- `devs_loop_end_session`

## Fluxo esperado

1. Consultar listas e progresso recente
2. Iniciar sessao
3. Criar task ativa
4. Trabalhar com timer ativo
5. Concluir task e checklist
6. Encerrar sessao e registrar em `devs-loop-progress.md`

## Compatibilidade

O CLI continua funcionando normalmente. O MCP eh um adaptador adicional em cima do mesmo core.

## Clientes MCP

Exemplos prontos por editor/cliente em:

- `MCP-CLIENTS.md`

## Publicacao distribuivel

Este pacote esta preparado para publish distribuivel:

- estado fora do pacote
- `.env` nao deve ser publicado
- `files` limita o conteudo publicado
- binarios:
  - `devs-loop`
  - `devs-loop-mcp`
