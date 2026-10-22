const adminForm = document.querySelector("#adminForm");
const adminPixValueInput = document.querySelector("#adminPixValue");
const adminTokenInput = document.querySelector("#adminToken");
const savePixValueButton = document.querySelector("#savePixValueButton");
const adminFeedback = document.querySelector("#adminFeedback");

const settingsEndpoint = "/api/settings";

function parseMoney(value) {
  const money = String(value).replace(/[^\d,.-]/g, "");
  const hasComma = money.includes(",");
  const hasDot = money.includes(".");

  let normalized = money;

  if (hasComma) {
    normalized = money.replace(/\./g, "").replace(",", ".");
  } else if (hasDot && /\.\d{1,2}$/.test(money)) {
    normalized = money;
  } else {
    normalized = money.replace(/\./g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function setInvalid(input, isInvalid) {
  input.closest(".field").classList.toggle("invalid", isInvalid);
}

async function loadSettings() {
  try {
    const response = await fetch(settingsEndpoint);
    if (!response.ok) throw new Error("Nao foi possivel carregar o valor atual.");

    const settings = await response.json();
    adminPixValueInput.value = formatMoney(settings.pixAmount);
    adminFeedback.textContent = `Valor atual: ${formatMoney(settings.pixAmount)}`;
  } catch (error) {
    adminFeedback.textContent = error.message;
  }
}

adminPixValueInput.addEventListener("blur", () => {
  adminPixValueInput.value = formatMoney(parseMoney(adminPixValueInput.value));
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const pixAmount = parseMoney(adminPixValueInput.value);
  setInvalid(adminPixValueInput, pixAmount <= 0);

  if (pixAmount <= 0) return;

  savePixValueButton.disabled = true;
  savePixValueButton.textContent = "Salvando...";
  adminFeedback.textContent = "Salvando valor...";

  try {
    const response = await fetch(settingsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminTokenInput.value,
      },
      body: JSON.stringify({ pixAmount }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Nao foi possivel salvar o valor.");
    }

    adminPixValueInput.value = formatMoney(result.pixAmount);
    adminFeedback.textContent = `Valor salvo: ${formatMoney(result.pixAmount)}`;
  } catch (error) {
    adminFeedback.textContent = error.message;
  } finally {
    savePixValueButton.disabled = false;
    savePixValueButton.textContent = "Salvar valor";
  }
});

loadSettings();
