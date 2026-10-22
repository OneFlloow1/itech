const form = document.querySelector("#checkoutForm");
const cpfInput = document.querySelector("#customerCpf");
const phoneInput = document.querySelector("#customerPhone");
const pixResult = document.querySelector("#pixResult");
const pixCodeInput = document.querySelector("#pixCode");
const pixAmount = document.querySelector("#pixAmount");
const pixHelper = document.querySelector("#pixHelper");
const qrBox = document.querySelector("#qrBox");
const copyPixButton = document.querySelector("#copyPixButton");
const newPixButton = document.querySelector("#newPixButton");
const generateButton = document.querySelector("#generateButton");
const pixValueInput = document.querySelector("#pixValue");

const gatewayConfig = {
  endpoint: "/api/pix",
  settingsEndpoint: "/api/settings",
  callbackUrl: "",
};

let configuredPixAmount = 120;

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function isGatewayConfigured() {
  return Boolean(gatewayConfig.endpoint);
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function isValidCpf(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;

  return check === Number(digits[10]);
}

function setInvalid(input, isInvalid) {
  input.closest(".field").classList.toggle("invalid", isInvalid);
}

function buildPayload() {
  return {
    customer: {
      name: document.querySelector("#customerName").value.trim(),
      cpf: onlyDigits(cpfInput.value),
      email: document.querySelector("#customerEmail").value.trim(),
      phone: onlyDigits(phoneInput.value),
    },
    service: "Pagamento Pix",
    amount: configuredPixAmount,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateForm() {
  const payload = buildPayload();
  const nameInput = document.querySelector("#customerName");
  const emailInput = document.querySelector("#customerEmail");

  setInvalid(nameInput, payload.customer.name.length < 3);
  setInvalid(emailInput, !isValidEmail(payload.customer.email));
  setInvalid(cpfInput, !isValidCpf(payload.customer.cpf));
  setInvalid(phoneInput, payload.customer.phone.length < 10);

  return (
    payload.customer.name.length >= 3 &&
    isValidEmail(payload.customer.email) &&
    isValidCpf(payload.customer.cpf) &&
    payload.customer.phone.length >= 10
  );
}

async function loadPixSettings() {
  try {
    const response = await fetch(gatewayConfig.settingsEndpoint);
    if (!response.ok) throw new Error("Nao foi possivel carregar o valor do PIX.");

    const settings = await response.json();
    const amount = Number(settings.pixAmount);

    if (Number.isFinite(amount) && amount > 0) {
      configuredPixAmount = amount;
    }
  } catch {
    configuredPixAmount = 120;
  }

  pixValueInput.value = formatMoney(configuredPixAmount);
}

async function createPixCharge(payload) {
  if (!isGatewayConfigured()) {
    const reference = `TECHCELL-${Date.now().toString().slice(-6)}`;
    return {
      amount: payload.amount,
      copyPasteCode: `PIX-DEMONSTRACAO-${reference}-${payload.customer.cpf}-${payload.amount.toFixed(2)}`,
      qrCodeUnavailable: true,
      message: "Modo demonstracao: configure a FortPay no servidor para gerar um PIX real.",
    };
  }

  const response = await fetch(gatewayConfig.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: payload.customer,
      amount: payload.amount,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Nao foi possivel gerar o PIX. Confira o token e os dados enviados.";

    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error || errorMessage;
    } catch {
      const errorText = await response.text();
      if (errorText) errorMessage = errorText;
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

function getQrCodeSrc(result) {
  const base64 = result.qrCodeBase64 || result.qr_code_base64;

  if (result.qrCodeUrl) return result.qrCodeUrl;
  if (result.qrCodeImage) return result.qrCodeImage;
  if (!base64) return "";

  return base64.startsWith("data:image")
    ? base64
    : `data:image/png;base64,${base64}`;
}

async function renderPix(result) {
  pixAmount.textContent = Number(result.amount || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const qrCodeText = result.qrCodeText || result.copyPasteCode || result.qr_code || result.pixCode || "";
  pixCodeInput.value = qrCodeText;
  pixHelper.textContent = result.message || `PIX ${result.status || "gerado"}. Abra o app do banco, pague com QR Code ou copia e cola.`;

  const src = getQrCodeSrc(result);
  qrBox.replaceChildren();
  let hasQrCode = false;
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "QR Code PIX";
    qrBox.appendChild(img);
    hasQrCode = true;
  } else if (qrCodeText && window.QRCode) {
    try {
      new window.QRCode(qrBox, {
        text: qrCodeText,
        width: 220,
        height: 220,
        correctLevel: window.QRCode.CorrectLevel.M,
      });
      hasQrCode = true;
    } catch (error) {
      console.error("Falha ao desenhar QR Code", error);
      qrBox.replaceChildren();
    }
  }

  if (!hasQrCode) {
    qrBox.innerHTML = `
      <div class="qr-unavailable">
        <span>QR Code indisponivel</span>
        <small>Use o codigo Pix copia e cola abaixo.</small>
      </div>
    `;
  }

  pixResult.hidden = false;
  pixResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

cpfInput.addEventListener("input", () => {
  cpfInput.value = formatCpf(cpfInput.value);
});

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhone(phoneInput.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateForm()) return;

  const payload = buildPayload();
  generateButton.disabled = true;
  generateButton.textContent = "Gerando PIX...";

  try {
    const result = await createPixCharge(payload);
    await renderPix(result);
  } catch (error) {
    pixResult.hidden = false;
    pixCodeInput.value = "";
    qrBox.innerHTML = `
      <div class="qr-unavailable">
        <span>Erro ao gerar QR Code</span>
        <small>Tente novamente ou confira a mensagem abaixo.</small>
      </div>
    `;
    pixHelper.textContent =
      error instanceof TypeError
        ? "Nao foi possivel conectar com o servidor local. Abra a pagina em http://localhost:3000 usando o server.js."
        : error.message;
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Gerar PIX";
  }
});

copyPixButton.addEventListener("click", async () => {
  if (!pixCodeInput.value) return;
  await navigator.clipboard.writeText(pixCodeInput.value);
  copyPixButton.textContent = "Copiado";
  setTimeout(() => {
    copyPixButton.textContent = "Copiar codigo";
  }, 1600);
});

newPixButton.addEventListener("click", () => {
  pixResult.hidden = true;
  pixCodeInput.value = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadPixSettings();
