const fs = require("fs");
const path = require("path");

const PACKAGE_JSON_PATH = path.join(__dirname, "package.json");

let cachedAppVersion = null;

function readPackageJson() {
  const packageJsonContents = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
  return JSON.parse(packageJsonContents);
}

function getAppVersion() {
  if (cachedAppVersion) {
    return cachedAppVersion;
  }

  const packageJson = readPackageJson();
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error(`Application version is missing in ${PACKAGE_JSON_PATH}.`);
  }

  cachedAppVersion = version;
  return cachedAppVersion;
}

const APP_VERSION = getAppVersion();

module.exports = {
  APP_VERSION,
  getAppVersion,
};
