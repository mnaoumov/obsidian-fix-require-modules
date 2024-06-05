import {
  execFromRoot,
  resolvePathFromRoot
} from "../tools/root.ts";

import {
  readFile,
  writeFile
} from "node:fs/promises";

import process from "node:process";

interface Manifest {
  minAppVersion: string;
  version: string;
}

interface Versions extends Record<string, string> { }

export default async function version(): Promise<void> {
  const targetVersion = process.env["npm_package_version"];

  if (!targetVersion) {
    throw new Error("package.json version is not set");
  }

  const indentSize = 2;

  const manifestJsonPath = resolvePathFromRoot("manifest.json");
  const versionsJsonPath = resolvePathFromRoot("versions.json");

  const manifest = JSON.parse(await readFile(manifestJsonPath, "utf8")) as Manifest;
  manifest.version = targetVersion;
  await writeFile(manifestJsonPath, JSON.stringify(manifest, null, indentSize) + "\n");

  const versions = JSON.parse(await readFile(versionsJsonPath, "utf8")) as Versions;
  versions[targetVersion] = manifest.minAppVersion;
  await writeFile(versionsJsonPath, JSON.stringify(versions, null, indentSize) + "\n");

  execFromRoot("git add manifest.json package.json versions.json");
}
