export function errorToString(error: unknown, level: number = 0): string {
  if (error === undefined) {
    return "";
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

    return `${indent}${str}`;
  }

  let ans = "";

  if (!error.stack) {
    ans += `${indent}${error.name}: ${error.message}`;
  } else {
    const stackLines = error.stack.split("\n").map(line => `${indent}${line}`);
    ans += stackLines.join("\n");
  }

  if (error.cause !== undefined) {
    ans += `\n${indent}Caused by:` + "\n";
    ans += errorToString(error.cause, level + 1);
  }

  return ans;
}

export function printError(error: unknown): void {
  console.error(errorToString(error));
}
