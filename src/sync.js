"use strict";

const { atomicWriteIfChanged, detectLineEnding, readUtf8File } = require("./files");
const { parseAndExtractOperations } = require("./openapi");
const { renderTable, replaceMarkerContent } = require("./markdown");

class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
  }
}

function asAppError(error) {
  if (error instanceof AppError) {
    return error;
  }
  if (error && typeof error.code === "string") {
    return new AppError(error.code, error.message, { cause: error });
  }
  return new AppError("UNEXPECTED", "An unexpected error occurred.", { cause: error });
}

async function syncDocumentation({ openapiPath, readmePath, cwd = process.cwd() }) {
  try {
    const openapi = await readUtf8File(openapiPath, "OpenAPI file", cwd);
    const readme = await readUtf8File(readmePath, "README file", cwd);
    const operations = parseAndExtractOperations(openapi.text);
    const eol = detectLineEnding(readme.text);
    const table = renderTable(operations, eol);
    const candidateText = replaceMarkerContent(readme.text, table, eol);
    const candidateBuffer = Buffer.from(candidateText, "utf8");
    const result = await atomicWriteIfChanged(readme.path, readme.buffer, candidateBuffer);

    return { status: result.changed ? "updated" : "unchanged" };
  } catch (error) {
    throw asAppError(error);
  }
}

module.exports = {
  AppError,
  asAppError,
  syncDocumentation,
};
