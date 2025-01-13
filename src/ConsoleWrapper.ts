import {
  FunctionHandlingMode,
  toJson
} from 'obsidian-dev-utils/Object';

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
  if (typeof arg === 'string') {
    return arg;
  }

  return toJson(arg, {
    functionHandlingMode: FunctionHandlingMode.NameOnly,
    maxDepth: 0,
    shouldCatchToJSONErrors: true,
    shouldHandleCircularReferences: true,
    shouldHandleUndefined: true,
    shouldSortKeys: true,
    tokenSubstitutions: {
      circularReference: '[[CircularReference]]',
      maxDepthLimitReached: '{...}',
      toJSONFailed: '[[ToJSONFailed]]',
    }
  });
}
