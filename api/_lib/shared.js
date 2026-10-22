const fs = require("node:fs");
const path = require("node:path");
const { createHash, timingSafeEqual } = require("node:crypto");

const SETTINGS_PATH = path.join(process.cwd(), "pix-settings.json");
const DEFAULT_PIX_SETTINGS = {
  pixAmount: 120,
};

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}

function authorizeSettingsWrite(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return process.env.VERCEL
      ? { statusCode: 503, message: "Configure ADMIN_TOKEN para alterar o valor em producao." }
      : null;
  }

  const supplied = request.headers["x-admin-token"];
  const actual = typeof supplied === "string" ? supplied : "";
  const expectedHash = createHash("sha256").update(expected).digest();
  const actualHash = createHash("sha256").update(actual).digest();
  if (!actual || !timingSafeEqual(expectedHash, actualHash)) {
    return { statusCode: 401, message: "Senha de administrador invalida." };
  }
  return null;
}

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");

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

function getEnvPixAmount() {
  const pixAmount = parsePixAmount(process.env.PIX_AMOUNT);

  if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
    return null;
  }

  return Number(pixAmount.toFixed(2));
}

async function readPixSettingsFromKv() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;

  const response = await fetch(`${process.env.KV_REST_API_URL}/get/pixAmount`, {
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const pixAmount = parsePixAmount(data.result);

  if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
    return null;
  }

  return Number(pixAmount.toFixed(2));
}

async function writePixSettingsToKv(settings) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return false;

  const response = await fetch(`${process.env.KV_REST_API_URL}/set/pixAmount/${settings.pixAmount}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    },
  });

  return response.ok;
}

function readPixSettingsFromFile() {
  if (!fs.existsSync(SETTINGS_PATH)) return null;

  try {
    const settingsText = fs.readFileSync(SETTINGS_PATH, "utf8").replace(/\u0000/g, "").trim();
    const settings = JSON.parse(settingsText);
    const pixAmount = Number(settings.pixAmount);

    if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
      return null;
    }

    return Number(pixAmount.toFixed(2));
  } catch {
    return null;
  }
}

function writePixSettingsToFile(settings) {
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

async function readPixSettings() {
  loadDotEnv();

  const kvAmount = await readPixSettingsFromKv();
  if (kvAmount) return { pixAmount: kvAmount, storage: "kv" };

  const envAmount = getEnvPixAmount();
  if (envAmount) return { pixAmount: envAmount, storage: "env" };

  const fileAmount = readPixSettingsFromFile();
  if (fileAmount) return { pixAmount: fileAmount, storage: "file" };

  return { ...DEFAULT_PIX_SETTINGS, storage: "default" };
}

async function writePixSettings(settings) {
  loadDotEnv();

  const savedToKv = await writePixSettingsToKv(settings);
  if (savedToKv) return { ...settings, storage: "kv" };

  if (process.env.VERCEL) {
    const error = new Error("Configure Vercel KV para salvar o valor pelo painel admin em producao.");
    error.statusCode = 501;
    throw error;
  }

  writePixSettingsToFile(settings);
  return { ...settings, storage: "file" };
}

function isPlaceholderToken(value) {
  return /COLOQUE|YOUR_TOKEN|SEU_TOKEN/i.test(value);
}

function maskDocument(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

module.exports = {
  authorizeSettingsWrite,
  isPlaceholderToken,
  loadDotEnv,
  maskDocument,
  parsePixAmount,
  readPixSettings,
  sendJson,
  writePixSettings,
};
