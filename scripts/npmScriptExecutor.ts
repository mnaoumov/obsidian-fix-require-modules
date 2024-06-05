import process from "node:process";
import runNpmScript from "./tools/npmScriptRunner.ts";

const scriptName = process.argv[2] || "";

try {
  const isLongRunning = await runNpmScript(scriptName);
  if (!isLongRunning) {
    process.exit(0);
  }
} catch (e) {
  printError(e);
  process.exit(1);
}

function printError(error: unknown, level: number = 0): void {
  if (error === undefined) {
    return;
  }

  const indent = "  ".repeat(level);

  if (!(error instanceof Error)) {
    let str = "";

    if (error === null) {
      str = "(null)";
    } else if (typeof error === "string") {
      str = error;
    } else {
      str = JSON.stringify(error);
    }

    console.error(`${indent}${str}`);
    return;
  }

  if (!error.stack) {
    console.error(`${indent}${error.name}: ${error.message}`);
  } else {
    const stackLines = error.stack.split("\n").map(line => `${indent}${line}`);
    console.error(stackLines.join("\n"));
  }

  if (error.cause !== undefined) {
    console.error(`${indent}Caused by:`);
    printError(error.cause, level + 1);
  }
}
