const fs = require("fs");
const path = require("path");

const ROOT_PACKAGE_JSON_PATH = path.resolve(__dirname, "../../package.json");

let cachedAppVersion = null;

function readRootPackageJson() {
  const packageJsonContents = fs.readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8");
  return JSON.parse(packageJsonContents);
}

function getAppVersion() {
  if (cachedAppVersion) {
    return cachedAppVersion;
  }

  const packageJson = readRootPackageJson();
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error(`Application version is missing in ${ROOT_PACKAGE_JSON_PATH}.`);
  }

  cachedAppVersion = version;
  return cachedAppVersion;
}

const APP_VERSION = getAppVersion();

module.exports = {
  APP_VERSION,
  getAppVersion,
};
