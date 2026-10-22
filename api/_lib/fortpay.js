const FORTPAY_TRANSACTIONS_URL =
  "https://api.fortpayplataforma.com.br/api/public/v1/transactions";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function centsFromReais(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function getFortPayConfig() {
  const apiToken = String(process.env.FORTPAY_API_TOKEN || "").trim();
  const offerHash = String(process.env.FORTPAY_OFFER_HASH || "").trim();
  const productHash = String(process.env.FORTPAY_PRODUCT_HASH || "").trim();
  const productTitle = String(process.env.FORTPAY_PRODUCT_TITLE || "Pagamento PIX").trim();
  const postbackUrl = String(
    process.env.FORTPAY_POSTBACK_URL || process.env.FORTPAY_CALLBACK_URL || "",
  ).trim();

  return { apiToken, offerHash, productHash, productTitle, postbackUrl };
}

function getFortPayConfigError(config, isPlaceholderToken) {
  if (!config.apiToken || isPlaceholderToken(config.apiToken)) {
    return "Configure FORTPAY_API_TOKEN no .env (local) ou nas variaveis de ambiente (Vercel).";
  }
  if (!config.offerHash || isPlaceholderToken(config.offerHash)) {
    return "Configure FORTPAY_OFFER_HASH com o hash da oferta no painel FortPay.";
  }
  if (!config.productHash || isPlaceholderToken(config.productHash)) {
    return "Configure FORTPAY_PRODUCT_HASH com o hash do produto no painel FortPay.";
  }
  return "";
}

function extractCustomer(payload) {
  const name = String(
    payload.customer?.name || payload.generatedName || payload.payerName || "",
  ).trim();
  let email = String(
    payload.customer?.email || payload.generatedEmail || payload.payerEmail || "",
  ).trim();
  const phone = onlyDigits(payload.customer?.phone || payload.customer?.phone_number || payload.payerPhone);
  const document = onlyDigits(
    payload.customer?.cpf ||
      payload.customer?.document ||
      payload.generatedDocument ||
      payload.payerDocument,
  );

  if (!email && document) {
    email = `cliente${document}@checkout.local`;
  }

  return { name, email, phone_number: phone, document };
}

function buildFortPayPixPayload(pixAmountReais, payload, config) {
  const amountCents = centsFromReais(pixAmountReais);
  const customer = extractCustomer(payload);

  const body = {
    amount: amountCents,
    offer_hash: config.offerHash,
    payment_method: "pix",
    customer,
    cart: [
      {
        product_hash: config.productHash,
        title: config.productTitle,
        cover: null,
        price: amountCents,
        quantity: 1,
        operation_type: 1,
        tangible: false,
      },
    ],
    expire_in_days: Number(process.env.FORTPAY_EXPIRE_IN_DAYS || 1),
    transaction_origin: "api",
  };

  if (config.postbackUrl) {
    body.postback_url = config.postbackUrl;
  }

  return body;
}

function mapFortPayPixResponse(apiResponse) {
  const data = apiResponse?.data && typeof apiResponse.data === "object" ? apiResponse.data : apiResponse;
  const transaction = data?.transaction && typeof data.transaction === "object" ? data.transaction : data;
  const pix = transaction?.pix && typeof transaction.pix === "object" ? transaction.pix : transaction;
  const pixCode = [
    pix.pix_qr_code, pix.pix_code, pix.pixCode, pix.copy_paste, pix.copyPaste,
    pix.emv, pix.qr_code, pix.qrCode, transaction.pix_code, transaction.pixCode,
    transaction.pix_qr_code, transaction.copy_paste, transaction.copyPaste,
    transaction.qr_code, transaction.qrCode,
  ].find((value) => typeof value === "string" && /^000201/.test(value.trim())) || "";
  const qrCode = pix.qr_code || pix.qrCode || transaction.qr_code || transaction.qrCode || "";
  const qrCodeImage = pix.qr_code_base64 || pix.qrCodeBase64 || pix.qr_code_url ||
    pix.qrCodeUrl || transaction.qr_code_base64 || transaction.qrCodeBase64 ||
    transaction.qr_code_url || transaction.qrCodeUrl || qrCode;
  const amountReais = Number(transaction.amount || data.amount || 0) / 100;

  const mapped = {
    amount: amountReais,
    status: transaction.status,
    hash: transaction.hash,
    copyPasteCode: pixCode,
    qrCodeText: pixCode,
    expiresAt: transaction.expires_at,
  };

  if (typeof qrCodeImage === "string" && qrCodeImage.startsWith("data:image")) {
    mapped.qrCodeUrl = qrCodeImage;
  } else if (typeof qrCodeImage === "string" && /^https?:\/\//.test(qrCodeImage)) {
    mapped.qrCodeUrl = qrCodeImage;
  } else if (typeof qrCodeImage === "string" && !/^000201/.test(qrCodeImage.trim()) && qrCodeImage) {
    mapped.qrCodeBase64 = qrCodeImage;
  }

  return mapped;
}

function parseFortPayError(data, status) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data?.message) return data.message;
  if (data?.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (Array.isArray(data?.errors)) return data.errors.map((item) => item.message || item).join("; ");
  return status === 401 ? "Token FortPay invalido ou ausente." : "A FortPay recusou a geracao do PIX.";
}

async function createFortPayPixTransaction(apiToken, body) {
  const url = `${FORTPAY_TRANSACTIONS_URL}?api_token=${encodeURIComponent(apiToken)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "Resposta invalida da FortPay." };
  }

  if (!response.ok || data.success === false) {
    const error = new Error(parseFortPayError(data, response.status));
    error.gatewayStatus = response.status;
    error.gatewayBody = data;
    throw error;
  }

  const result = mapFortPayPixResponse(data);
  if (!result.copyPasteCode) {
    const error = new Error("A FortPay respondeu sem um codigo Pix valido. Verifique a oferta e o retorno da API.");
    error.gatewayStatus = response.status;
    error.gatewayBody = data;
    throw error;
  }
  return result;
}

module.exports = {
  FORTPAY_TRANSACTIONS_URL,
  buildFortPayPixPayload,
  createFortPayPixTransaction,
  getFortPayConfig,
  getFortPayConfigError,
};
