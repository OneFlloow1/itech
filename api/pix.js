const {
  buildFortPayPixPayload,
  createFortPayPixTransaction,
  getFortPayConfig,
  getFortPayConfigError,
} = require("./_lib/fortpay");
const {
  isPlaceholderToken,
  loadDotEnv,
  maskDocument,
  readPixSettings,
  sendJson,
} = require("./_lib/shared");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, {
      message: "Metodo nao permitido.",
    });
    return;
  }

  loadDotEnv();
  const config = getFortPayConfig();
  const configError = getFortPayConfigError(config, isPlaceholderToken);

  if (configError) {
    sendJson(response, 500, { message: configError });
    return;
  }

  try {
    const payload = typeof request.body === "object" ? request.body : JSON.parse(request.body || "{}");
    const settings = await readPixSettings();
    const fortPayPayload = buildFortPayPixPayload(settings.pixAmount, payload, config);
    const customer = fortPayPayload.customer;

    console.log("Gerando PIX FortPay", {
      amount: fortPayPayload.amount,
      storage: settings.storage,
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
};
