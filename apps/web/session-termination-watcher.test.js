const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const frontServerSource = fs.readFileSync(path.join(__dirname, "front-server.js"), "utf8");

test("front server injects a shared session termination watcher for cookie sessions", () => {
  assert.match(frontServerSource, /function buildSessionTerminationWatcherMarkup\(nonce\)/);
  assert.match(frontServerSource, /data-global-session-watcher="true"/);
  assert.match(frontServerSource, /const SESSION_NOTICE_STORAGE_KEY = "mp_session_notice";/);
  assert.match(frontServerSource, /window\.fetch\("\/auth\/session-state"/);
  assert.match(frontServerSource, /Session ending soon/);
  assert.match(frontServerSource, /You will be signed out in /);
});
