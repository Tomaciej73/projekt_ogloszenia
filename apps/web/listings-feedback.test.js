const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

test("empty listings state has a clear call to action and refresh reports its outcome", () => {
  assert.match(indexHtml, /\.empty-listings \{ display: flex/);
  assert.match(indexHtml, /function renderEmptyListings\(list\)/);
  assert.match(indexHtml, /cta\.href = '\/create-listing'/);
  assert.match(indexHtml, /cta\.textContent = 'Create your first listing'/);
  assert.match(indexHtml, /refreshListingsBtn'\)\?\.addEventListener\('click', refreshListings\)/);
  assert.match(indexHtml, /toast\(message, 'success'\)/);
  assert.match(indexHtml, /toast\(error\.message \|\| 'Could not refresh listings\. Please try again\.', 'error'\)/);
});
