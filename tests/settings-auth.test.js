const assert = require("node:assert/strict");
const test = require("node:test");
const { authorizeSettingsWrite } = require("../api/_lib/shared");

test("production settings require an admin token", () => {
  const previousToken = process.env.ADMIN_TOKEN;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.ADMIN_TOKEN;
    process.env.VERCEL = "1";
    assert.equal(authorizeSettingsWrite({ headers: {} }).statusCode, 503);

    process.env.ADMIN_TOKEN = "secret-for-test";
    assert.equal(authorizeSettingsWrite({ headers: {} }).statusCode, 401);
    assert.equal(authorizeSettingsWrite({ headers: { "x-admin-token": "wrong" } }).statusCode, 401);
    assert.equal(authorizeSettingsWrite({ headers: { "x-admin-token": "secret-for-test" } }), null);
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previousToken;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});
