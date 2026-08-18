import { mkdir, writeFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY must be in the form owner/repository.");
}

const endpoint = `${serverUrl}/${repository}/releases/latest/download/latest.json`;
const config = {
  plugins: {
    updater: {
      endpoints: [endpoint],
    },
  },
};

await mkdir(".github", { recursive: true });
await writeFile(".github/tauri-release.conf.json", `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Updater endpoint configured for ${repository}.`);
