"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { TextDecoder } = require("node:util");

function codedError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function resolveFromCwd(filePath, cwd = process.cwd()) {
  return path.resolve(cwd, filePath);
}

function decodeUtf8(buffer, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch (error) {
    throw codedError("INVALID_UTF8", `${label} is not valid UTF-8.`, error);
  }
}

async function readUtf8File(filePath, label, cwd = process.cwd()) {
  const resolvedPath = resolveFromCwd(filePath, cwd);

  try {
    const stats = await fs.stat(resolvedPath);
    if (stats.isDirectory()) {
      throw codedError("IS_DIRECTORY", `${label} path points to a directory: ${resolvedPath}`);
    }

    const buffer = await fs.readFile(resolvedPath);
    return { path: resolvedPath, buffer, text: decodeUtf8(buffer, label) };
  } catch (error) {
    if (error.code === "IS_DIRECTORY" || error.code === "INVALID_UTF8") {
      throw error;
    }
    if (error.code === "ENOENT") {
      throw codedError("FILE_NOT_FOUND", `${label} was not found: ${resolvedPath}`, error);
    }
    throw codedError("FILE_READ", `Unable to read ${label}: ${resolvedPath}`, error);
  }
}

function detectLineEnding(text) {
  const newlineIndex = text.indexOf("\n");
  if (newlineIndex > 0 && text[newlineIndex - 1] === "\r") {
    return "\r\n";
  }
  return "\n";
}

async function atomicWriteIfChanged(targetPath, originalBuffer, candidateBuffer) {
  if (originalBuffer.equals(candidateBuffer)) {
    return { changed: false };
  }

  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(directory, `.docsync-${process.pid}-${randomUUID()}.tmp`);
  let handle;

  try {
    handle = await fs.open(temporaryPath, "wx");
    await handle.writeFile(candidateBuffer);
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, targetPath);
    return { changed: true };
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.unlink(temporaryPath).catch(() => {});
    throw codedError("FILE_WRITE", `Unable to replace README: ${targetPath}`, error);
  }
}

module.exports = {
  atomicWriteIfChanged,
  decodeUtf8,
  detectLineEnding,
  readUtf8File,
  resolveFromCwd,
};
