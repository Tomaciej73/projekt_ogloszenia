const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

test("logout clears authentication fields and login form discourages autofill", () => {
  assert.match(indexHtml, /<form id="loginForm" autocomplete="off">/);
  assert.match(indexHtml, /id="loginEmail"[^>]*autocomplete="off"/);
  assert.match(indexHtml, /id="loginPassword"[^>]*autocomplete="off"/);
  assert.match(indexHtml, /function showLoggedOut\(\)[\s\S]*?clearAuthenticationFields\(\)/);
  assert.match(indexHtml, /function clearAuthenticationFields\(\)[\s\S]*?loginEmail[\s\S]*?loginPassword/);
});
