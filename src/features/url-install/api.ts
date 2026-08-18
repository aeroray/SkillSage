import { invokeCommand } from "../../lib/tauri";
import type { DistributionActions } from "../skills/types";
import type { GithubUrlInspection, UrlInstallResult } from "./types";

export function inspectGithubUrl(url: string) {
  return invokeCommand<GithubUrlInspection>("inspect_github_url", { url });
}

export function installFromGithubUrl(url: string, skillPath: string | undefined, agents: string[], conflicts?: DistributionActions) {
  return invokeCommand<UrlInstallResult>("url_install", { url, skillPath, agents, conflicts });
}
