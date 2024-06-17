export function printError(error: unknown): void {
  if (error === undefined) {
    return;
  }

  if (!(error instanceof Error)) {
    let str = "";

    if (error === null) {
      str = "(null)";
    } else if (typeof error === "string") {
      str = error;
    } else {
      str = JSON.stringify(error);
    }

    console.error(str);
    return;
  }

  if (!error.stack) {
    console.error(`${error.name}: ${error.message}`);
  } else {
    console.error(error.stack);
  }

  if (error.cause !== undefined) {
    console.error(`Caused by:`);
    printError(error.cause);
  }
}
