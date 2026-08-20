import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = packageJson.version;

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json must contain a valid SemVer version, received: ${version || "<empty>"}`);
}

const cargoPath = "src-tauri/Cargo.toml";
const cargoToml = await readFile(cargoPath, "utf8");
const packageVersionPattern = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)("\s*$)/m;

if (!packageVersionPattern.test(cargoToml)) {
  throw new Error(`Could not find the [package] version in ${cargoPath}.`);
}

const nextCargoToml = cargoToml.replace(packageVersionPattern, (_, prefix, _previousVersion, suffix) => `${prefix}${version}${suffix}`);
if (nextCargoToml !== cargoToml) {
  await writeFile(cargoPath, nextCargoToml, "utf8");
  console.log(`Synchronized Cargo package version to ${version}.`);
} else {
  console.log(`Cargo package version is already ${version}.`);
}
