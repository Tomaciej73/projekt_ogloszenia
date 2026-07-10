require("dotenv").config();

const { loadApiConfig } = require("@multiportal/config/dist/config.js");

const config = loadApiConfig();

module.exports = { config };
