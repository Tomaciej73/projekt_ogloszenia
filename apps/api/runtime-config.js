require("dotenv").config();
require("tsx/cjs");

const { loadApiConfig } = require("../../packages/config/src/config.ts");

const config = loadApiConfig();

module.exports = { config };
