"use strict";

const START_MARKER = "<!-- API_REFERENCE_START -->";
const END_MARKER = "<!-- API_REFERENCE_END -->";
const METHOD_ORDER = new Map([
  ["GET", 0],
  ["POST", 1],
  ["PUT", 2],
  ["PATCH", 3],
  ["DELETE", 4],
  ["HEAD", 5],
  ["OPTIONS", 6],
  ["TRACE", 7],
]);

function markerError(message) {
  const error = new Error(message);
  error.code = "MARKER_VALIDATION";
  return error;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeAndEscape(value, fallback = "-") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/[ \t\r\n]+/g, " ").trim();
  return (normalized || fallback).replace(/\|/g, "\\|");
}

function prepareOperations(operations) {
  return operations
    .map((operation) => ({
      ...operation,
      path: normalizeAndEscape(operation.originalPath, ""),
      summary: normalizeAndEscape(operation.summary),
    }))
    .sort((left, right) => {
      return (
        compareCodeUnits(left.path, right.path) ||
        compareCodeUnits(left.originalPath, right.originalPath) ||
        (METHOD_ORDER.get(left.method) ?? Number.MAX_SAFE_INTEGER) -
          (METHOD_ORDER.get(right.method) ?? Number.MAX_SAFE_INTEGER) ||
        compareCodeUnits(left.method, right.method)
      );
    });
}

function renderTable(operations, eol = "\n") {
  const lines = ["| Method | Path | Summary |", "| ------ | ---- | ------- |"];

  for (const operation of prepareOperations(operations)) {
    lines.push(`| ${operation.method} | ${operation.path} | ${operation.summary} |`);
  }

  return `${lines.join(eol)}${eol}`;
}

function countOccurrences(text, marker) {
  let count = 0;
  let offset = 0;

  while ((offset = text.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }

  return count;
}

function replaceMarkerContent(readmeText, table, eol) {
  if (countOccurrences(readmeText, START_MARKER) !== 1) {
    throw markerError(`README must contain exactly one ${START_MARKER} marker.`);
  }
  if (countOccurrences(readmeText, END_MARKER) !== 1) {
    throw markerError(`README must contain exactly one ${END_MARKER} marker.`);
  }

  const startIndex = readmeText.indexOf(START_MARKER);
  const endIndex = readmeText.indexOf(END_MARKER);
  if (startIndex > endIndex) {
    throw markerError("README API reference markers are in the wrong order.");
  }

  const prefix = readmeText.slice(0, startIndex + START_MARKER.length);
  const suffix = readmeText.slice(endIndex);
  return `${prefix}${eol}${table}${suffix}`;
}

module.exports = {
  END_MARKER,
  START_MARKER,
  compareCodeUnits,
  normalizeAndEscape,
  prepareOperations,
  renderTable,
  replaceMarkerContent,
};
