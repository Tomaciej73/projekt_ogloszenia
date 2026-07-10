require("dotenv").config();

const { loadWebConfig } = require("@multiportal/config/dist/config.js");

const config = loadWebConfig();

module.exports = { config };
