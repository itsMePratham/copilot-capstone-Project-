#!/usr/bin/env node
"use strict";

const { Command, CommanderError } = require("commander");
const { AppError, syncDocumentation } = require("./sync");

function createProgram() {
  const program = new Command();

  program
    .name("docsync")
    .description("Synchronize a README API reference from an OpenAPI document.")
    .showHelpAfterError()
    .exitOverride();

  program
    .command("sync")
    .requiredOption("--openapi <path>", "path to the OpenAPI YAML file")
    .requiredOption("--readme <path>", "path to the README file")
    .action(async (options) => {
      const result = await syncDocumentation({
        openapiPath: options.openapi,
        readmePath: options.readme,
      });

      console.log(result.status === "updated" ? "README updated." : "README already up-to-date.");
    });

  return program;
}

async function main(argv = process.argv) {
  const program = createProgram();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }

    const message = error instanceof AppError ? error.message : "An unexpected error occurred.";
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = { createProgram, main };
