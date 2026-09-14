"use strict";

module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "script",
  },
  ignorePatterns: ["coverage/", "node_modules/"],
  rules: {
    "no-console": "off",
  },
};
