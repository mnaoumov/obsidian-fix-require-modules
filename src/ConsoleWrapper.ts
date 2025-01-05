import { errorToString } from 'obsidian-dev-utils/Error';

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';

export class ConsoleWrapper {
  public constructor(private resultEl: HTMLElement) {
  }

  public appendToResultEl(args: unknown[], method: ConsoleMethod): void {
    const formattedMessage = args.map(formatMessage).join(' ');
    this.appendToLog(formattedMessage, method);
  }

  public getConsoleInstance(shouldWrapConsole: boolean): Console {
    if (!shouldWrapConsole) {
      return console;
    }

    const wrappedConsole = { ...console };

    for (const method of ['log', 'debug', 'error', 'info', 'warn'] as ConsoleMethod[]) {
      wrappedConsole[method] = (...args): void => {
        console[method](...args);
        this.appendToResultEl(args, method);
      };
    }

    return wrappedConsole;
  }

  public writeSystemMessage(message: string): void {
    const systemMessage = this.resultEl.createDiv({ cls: 'system-message', text: message });
    systemMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private appendToLog(message: string, method: ConsoleMethod): void {
    const logEntry = this.resultEl.createDiv({ cls: `console-log-entry console-log-entry-${method}`, text: message });
    logEntry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function formatMessage(arg: unknown): string {
  if (arg === null) {
    return 'null';
  }

  if (arg === undefined) {
    return formatMessage(jsonReplacer(arg));
  }

  if (typeof arg === 'function') {
    return formatMessage(jsonReplacer(arg));
  }

  if (arg instanceof Error) {
    return formatMessage(jsonReplacer(arg));
  }

  if (typeof arg === 'object') {
    return JSON.stringify(arg, (_key, value) => jsonReplacer(value), 2);
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(arg);
}

function jsonReplacer(value: unknown): unknown {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'function') {
    return `function ${value.name || 'anonymous'}()`;
  }

  if (value instanceof Error) {
    return errorToString(value);
  }

  return value;
}
