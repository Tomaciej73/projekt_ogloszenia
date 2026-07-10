require("dotenv").config();
require("tsx/cjs");

const { loadWorkerConfig } = require("../../packages/config/src/config.ts");

const config = loadWorkerConfig();

module.exports = { config };
