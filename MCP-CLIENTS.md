# MCP Clients

Blocos prontos para configurar o `devs-loop-mcp` como MCP distribuivel.

Comando padrao:

```json
{
  "command": "npx",
  "args": [
    "-y",
    "@renatocostaguedesdemorais/devs-loop-mcp",
    "server"
  ]
}
```

## Antigravity

Adicionar em `settings.json`:

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

## Cursor

Adicionar em `settings.json`:

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

## Codex / ChatGPT Apps / clientes compatíveis com MCP

Usar este bloco na configuracao de servidores MCP:

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

## Claude Code

Se o cliente suportar declaracao de MCP por comando, usar:

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

## Pre-requisito em qualquer cliente

No primeiro uso da maquina:

```bash
npx -y @renatocostaguedesdemorais/devs-loop-mcp install
```

E preencher:

```env
~/.devs-loop/.env
CLICKUP_API_TOKEN=...
DEV_EMAIL=...
```
