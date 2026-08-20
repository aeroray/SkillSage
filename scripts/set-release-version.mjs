import { readFile } from "node:fs/promises";

const rawTag = process.argv[2] || process.env.GITHUB_REF_NAME;
const version = rawTag?.replace(/^v/, "");

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Release tag must contain a SemVer version, received: ${rawTag || "<empty>"}`);
}

const packagePath = "package.json";
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
if (packageJson.version !== version) {
  throw new Error(`package.json version ${packageJson.version} does not match release tag ${version}. Update package.json first.`);
}

const cargoPath = "src-tauri/Cargo.toml";
const cargoToml = await readFile(cargoPath, "utf8");
const cargoVersion = cargoToml.match(/(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)("\s*$)/m)?.[2];
if (cargoVersion !== version) {
  throw new Error(`src-tauri/Cargo.toml version ${cargoVersion || "<missing>"} is not synchronized with package.json ${version}. Run pnpm sync:version first.`);
}

console.log(`Release version verified from package.json: ${version}.`);
