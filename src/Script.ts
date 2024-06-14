import { printError } from "./Error.ts";

export type Invocable = () => void | Promise<void>;

export type Script = {
  name: string;
  invoke: Invocable;
  isStartupScript?: boolean;
}

export async function invoke(script: Script): Promise<void> {
  console.debug(`Invoking ${script.isStartupScript ? "startup " : ""}script: ${script.name}`);
  try {
    await script.invoke();
  } catch (error) {
    printError(new Error(`Error invoking script: ${script.name}`, { cause: error }));
  }
}

