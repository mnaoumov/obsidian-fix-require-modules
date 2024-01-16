import {
  readFile,
  writeFile
} from "fs/promises";
import process from "process";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
  throw new Error("package.json version is not set");
}

const indentSize = 2;

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
await writeFile("manifest.json", JSON.stringify(manifest, null, indentSize) + "\n");

// update versions.json with target version and minAppVersion from manifest.json
const versions = JSON.parse(await readFile("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
await writeFile("versions.json", JSON.stringify(versions, null, indentSize) + "\n");
