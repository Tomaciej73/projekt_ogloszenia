require("dotenv").config();
require("tsx/cjs");

const { loadWebConfig } = require("../../packages/config/src/config.ts");

const config = loadWebConfig();

module.exports = { config };
