require("dotenv").config();

const { loadWorkerConfig } = require("@multiportal/config/dist/config.js");

const config = loadWorkerConfig();

module.exports = { config };
