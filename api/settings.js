const {
  authorizeSettingsWrite,
  parsePixAmount,
  readPixSettings,
  sendJson,
  writePixSettings,
} = require("./_lib/shared");

module.exports = async function handler(request, response) {
  if (request.method === "GET") {
    const settings = await readPixSettings();
    sendJson(response, 200, settings);
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  const authorization = authorizeSettingsWrite(request);
  if (authorization) {
    sendJson(response, authorization.statusCode, { message: authorization.message });
    return;
  }

  try {
    const payload = typeof request.body === "object" ? request.body : JSON.parse(request.body || "{}");
    const pixAmount = parsePixAmount(payload.pixAmount);

    if (!Number.isFinite(pixAmount) || pixAmount <= 0) {
      sendJson(response, 400, {
        message: "Informe um valor de PIX maior que zero.",
      });
      return;
    }

    const settings = await writePixSettings({
      pixAmount: Number(pixAmount.toFixed(2)),
    });

    sendJson(response, 200, settings);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      message: error.message || "Nao foi possivel salvar o valor do PIX.",
    });
  }
};
