import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceLogoName = "skillsage-logo.png";
const sourceLogo = resolve(projectRoot, sourceLogoName);
const publicLogo = resolve(projectRoot, "public", "skillsage-logo.png");

if (!existsSync(sourceLogo)) {
  console.error(`Missing canonical logo source: ${sourceLogo}`);
  process.exit(1);
}

copyFileSync(sourceLogo, publicLogo);

if (process.platform === "win32") {
  execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm exec tauri icon ${sourceLogoName}`], {
    cwd: projectRoot,
    stdio: "inherit",
  });
} else {
  execFileSync("pnpm", ["exec", "tauri", "icon", sourceLogoName], {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

for (const unusedGeneratedIcon of ["src-tauri/icons/android", "src-tauri/icons/ios", "src-tauri/icons/64x64.png"]) {
  rmSync(resolve(projectRoot, unusedGeneratedIcon), { force: true, recursive: true });
}

console.log(`Branding synchronized from ${sourceLogo}`);
