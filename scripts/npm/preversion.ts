import { execFromRoot } from "scripts/tools/root.ts";
import runNpmScript from "../tools/npmScriptRunner.ts";

export default async function preversion(): Promise<void> {
  try {
    execFromRoot("gh --version");
  } catch {
    throw new Error("GitHub CLI is not installed");
  }

  await runNpmScript("build");
  await runNpmScript("lint");
}
