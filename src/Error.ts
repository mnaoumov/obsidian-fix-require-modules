export function printError(error: unknown, level: number = 0): void {
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
