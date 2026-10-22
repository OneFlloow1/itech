const assert = require("node:assert/strict");
const test = require("node:test");
const { FORTPAY_TRANSACTIONS_URL, createFortPayPixTransaction } = require("../api/_lib/fortpay");

const pixCode = "00020101021226800014br.gov.bcb.pix6304ABCD";

async function withGatewayResponse(body, run) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test("uses qr_code as Pix copy and paste when it is an EMV code", async () => {
  await withGatewayResponse({ data: { amount: 50000, qr_code: pixCode } }, async () => {
    const result = await createFortPayPixTransaction("test-token", {});
    assert.equal(result.copyPasteCode, pixCode);
    assert.equal(result.amount, 500);
    assert.equal(result.qrCodeBase64, undefined);
  });
});

test("uses the working FortPay API host", () => {
  assert.equal(
    FORTPAY_TRANSACTIONS_URL,
    "https://api.fortpayplataforma.com.br/api/public/v1/transactions",
  );
});

test("reads a Pix code from a nested transaction", async () => {
  await withGatewayResponse({ data: { transaction: { amount: 50000, pix: { copy_paste: pixCode } } } }, async () => {
    const result = await createFortPayPixTransaction("test-token", {});
    assert.equal(result.copyPasteCode, pixCode);
  });
});

test("reads the FortPay pix.pix_qr_code field", async () => {
  await withGatewayResponse({ data: { amount: 50000, pix: { pix_qr_code: pixCode } } }, async () => {
    const result = await createFortPayPixTransaction("test-token", {});
    assert.equal(result.copyPasteCode, pixCode);
    assert.equal(result.amount, 500);
  });
});

test("rejects a gateway success response without a Pix code", async () => {
  await withGatewayResponse({ success: true, data: { status: "pending" } }, async () => {
    await assert.rejects(createFortPayPixTransaction("test-token", {}), /sem um codigo Pix valido/);
  });
});
