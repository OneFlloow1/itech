const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildFortPayPixPayload,
  createFortPayPixTransaction,
  getFortPayConfig,
  getFortPayConfigError,
} = require("./api/_lib/fortpay");

const PORT = Number(process.env.PORT || 3000);
const SETTINGS_PATH = path.join(__dirname, "pix-settings.json");
const DEFAULT_PIX_SETTINGS = {
  pixAmount: 120,
};
loadDotEnv();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function readPixSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_PIX_SETTINGS };

  try {
    const settingsText = fs.readFileSync(SETTINGS_PATH, "utf8").replace(/\u0000/g, "").trim();
    const settings = JSON.parse(settingsText);
    const pixAmount = Number(settings.pixAmount);

    if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
      return { ...DEFAULT_PIX_SETTINGS };
    }

    return {
      pixAmount: Number(pixAmount.toFixed(2)),
    };
  } catch {
    return { ...DEFAULT_PIX_SETTINGS };
  }
}

function writePixSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

function parsePixAmount(value) {
  if (typeof value === "number") return value;

  const money = String(value || "").replace(/[^\d,.-]/g, "");
  const hasComma = money.includes(",");
  const hasDot = money.includes(".");

  if (hasComma) {
    return Number(money.replace(/\./g, "").replace(",", "."));
  }

  if (hasDot && /\.\d{1,2}$/.test(money)) {
    return Number(money);
  }

  return Number(money.replace(/\./g, ""));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Payload muito grande."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handlePixProxy(request, response) {
  loadDotEnv();
  const config = getFortPayConfig();
  const configError = getFortPayConfigError(config, isPlaceholderToken);

  if (configError) {
    sendJson(response, 500, { message: configError });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const pixAmount = readPixSettings().pixAmount;
    const fortPayPayload = buildFortPayPixPayload(pixAmount, payload, config);
    const customer = fortPayPayload.customer;

    console.log("Gerando PIX FortPay", {
      amount: fortPayPayload.amount,
      generatedName: customer.name,
      generatedDocument: maskDocument(customer.document),
      hasEmail: Boolean(customer.email),
      offerHash: config.offerHash,
    });

    const result = await createFortPayPixTransaction(config.apiToken, fortPayPayload);
    sendJson(response, 200, result);
  } catch (error) {
    if (error.gatewayStatus) {
      console.error("Erro FortPay", {
        status: error.gatewayStatus,
        message: error.message,
      });

      sendJson(response, 502, {
        message: error.message,
        gatewayStatus: error.gatewayStatus,
      });
      return;
    }

    console.error("Falha ao gerar PIX", {
      message: error.message,
      cause: error.cause ? error.cause.message : "",
    });

    sendJson(response, 502, {
      message:
        error.message === "fetch failed"
          ? "Nao foi possivel conectar com a FortPay agora. Tente novamente em instantes."
          : error.message || "Nao foi possivel gerar o PIX.",
    });
  }
}

function maskDocument(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function handlePixSettings(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, readPixSettings());
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405);
    response.end("Metodo nao permitido.");
    return;
  }

  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const pixAmount = parsePixAmount(payload.pixAmount);

    if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
      sendJson(response, 400, {
        message: "Informe um valor de PIX maior que zero.",
      });
      return;
    }

    const settings = {
      pixAmount: Number(pixAmount.toFixed(2)),
    };

    writePixSettings(settings);
    sendJson(response, 200, settings);
  } catch (error) {
    sendJson(response, 500, {
      message: error.message || "Nao foi possivel salvar o valor do PIX.",
    });
  }
}

function isPlaceholderToken(value) {
  return /COLOQUE|YOUR_TOKEN|SEU_TOKEN/i.test(value);
}

function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Arquivo nao encontrado.");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "POST" && request.url === "/api/pix") {
    handlePixProxy(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/settings") {
    handlePixSettings(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStaticFile(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Metodo nao permitido.");
});

server.listen(PORT, () => {
  console.log(`Checkout rodando em http://localhost:${PORT}`);
});
