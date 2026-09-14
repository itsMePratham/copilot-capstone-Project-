"use strict";

const YAML = require("yaml");

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

function validationError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = "OPENAPI_VALIDATION";
  return error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseOpenApi(yamlText) {
  const document = YAML.parseDocument(yamlText, { uniqueKeys: true });

  if (document.errors.length > 0) {
    throw validationError(`Invalid OpenAPI YAML: ${document.errors[0].message}`);
  }

  try {
    return document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    throw validationError("Invalid OpenAPI YAML alias expansion.", error);
  }
}

function validateAndExtract(specification) {
  if (!isObject(specification)) {
    throw validationError("Invalid OpenAPI document: root must be an object.");
  }
  if (typeof specification.openapi !== "string" || !specification.openapi.startsWith("3.")) {
    throw validationError('Invalid OpenAPI document: "openapi" must be a 3.x string.');
  }
  if (!isObject(specification.paths)) {
    throw validationError('Invalid OpenAPI document: "paths" must be an object.');
  }

  const operations = [];

  for (const [originalPath, pathItem] of Object.entries(specification.paths)) {
    if (!originalPath.startsWith("/")) {
      throw validationError(`Invalid OpenAPI path "${originalPath}": expected a leading slash.`);
    }
    if (!isObject(pathItem)) {
      throw validationError(`Invalid path item at ${originalPath}: expected an object.`);
    }
    if (Object.hasOwn(pathItem, "$ref")) {
      throw validationError(`Unsupported $ref in path item at ${originalPath}.`);
    }

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      if (!isObject(operation)) {
        throw validationError(
          `Invalid operation ${method} at path ${originalPath}: expected an object.`,
        );
      }
      if (Object.hasOwn(operation, "$ref")) {
        throw validationError(`Unsupported $ref in operation ${method} at path ${originalPath}.`);
      }

      operations.push({
        originalPath,
        method: method.toUpperCase(),
        summary: operation.summary,
      });
    }
  }

  return operations;
}

function parseAndExtractOperations(yamlText) {
  return validateAndExtract(parseOpenApi(yamlText));
}

module.exports = {
  HTTP_METHODS,
  parseAndExtractOperations,
  parseOpenApi,
  validateAndExtract,
};
