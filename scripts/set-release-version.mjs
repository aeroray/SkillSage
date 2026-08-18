import { readFile, writeFile } from "node:fs/promises";

const rawTag = process.argv[2] || process.env.GITHUB_REF_NAME;
const version = rawTag?.replace(/^v/, "");

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Release tag must contain a SemVer version, received: ${rawTag || "<empty>"}`);
}

const packagePath = "package.json";
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const cargoPath = "src-tauri/Cargo.toml";
const cargoToml = await readFile(cargoPath, "utf8");
const nextCargoToml = cargoToml.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m, `$1${version}$2`);

if (nextCargoToml === cargoToml) {
  throw new Error("Could not update the package version in src-tauri/Cargo.toml.");
}

await writeFile(cargoPath, nextCargoToml, "utf8");
console.log(`Release version set to ${version}.`);
