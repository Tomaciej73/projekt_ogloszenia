const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const templateSource = fs.readFileSync(path.join(__dirname, "mail.js"), "utf8");

test("email template declares an explicit light color scheme and opaque contrast colors", () => {
  assert.match(templateSource, /<meta name="color-scheme" content="light">/);
  assert.match(templateSource, /<meta name="supported-color-schemes" content="light">/);
  assert.match(templateSource, /bgcolor="#ffffff"/);
  assert.doesNotMatch(templateSource, /-webkit-text-fill-color:transparent/);
  assert.doesNotMatch(templateSource, /rgba\(/);
});
