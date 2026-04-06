// ============================================================
// DEVS-LOOP — ClickUp API Client
// Zero dependências externas — usa apenas Node.js nativo
// ============================================================

const https = require("https");
const path = require("path");
const fs = require("fs");
const { getHomeConfigDir, getPackageRoot, getProjectConfigDir } = require("./paths.cjs");

// Carregar .env manualmente (sem dotenv)
function loadEnv() {
  const locations = [
    path.join(getProjectConfigDir(), ".env"),
    path.join(getHomeConfigDir(), ".env"),
    path.join(process.cwd(), ".env"),
    path.join(getPackageRoot(), ".env"),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const val = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      break;
    }
  }
}

loadEnv();

const API_TOKEN = process.env.CLICKUP_API_TOKEN;

if (!API_TOKEN) {
  console.error("❌ CLICKUP_API_TOKEN não definido.");
  console.error("   Crie .devs-loop/.env com: CLICKUP_API_TOKEN=pk_...");
  process.exit(1);
}

// Request genérico para a API do ClickUp
function request(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.clickup.com",
      path: `/api/v2${endpoint}`,
      method,
      headers: {
        Authorization: API_TOKEN,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", reject);

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Helpers
const api = {
  get: (endpoint) => request("GET", endpoint),
  post: (endpoint, body) => request("POST", endpoint, body),
  put: (endpoint, body) => request("PUT", endpoint, body),
  delete: (endpoint) => request("DELETE", endpoint),
};

module.exports = { api, loadEnv };
