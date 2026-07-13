const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

test("account panel groups identity, session status, and paired actions", () => {
  assert.match(indexHtml, /class="account-identity"/);
  assert.match(indexHtml, /class="account-email"/);
  assert.match(indexHtml, /currentBadge\.className = 'session-current-badge'/);
  assert.match(indexHtml, /class="account-actions"[\s\S]*?id="endOtherSessionsBtn"[\s\S]*?id="logoutBtn"/);
  assert.match(indexHtml, /\.account-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
