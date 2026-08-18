import { invoke } from "@tauri-apps/api/core";

const previewSkills = [
  {
    id: "vercel-labs/agent-skills/frontend-design",
    slug: "frontend-design",
    name: "frontend-design",
    source: "vercel-labs/agent-skills",
    installs: 128400,
    sourceType: "github",
    url: "https://skills.sh/vercel-labs/agent-skills/frontend-design",
    isDuplicate: false,
  },
  {
    id: "vercel-labs/agent-skills/web-design-guidelines",
    slug: "web-design-guidelines",
    name: "web-design-guidelines",
    source: "vercel-labs/agent-skills",
    installs: 86400,
    sourceType: "github",
    url: "https://skills.sh/vercel-labs/agent-skills/web-design-guidelines",
    isDuplicate: false,
  },
  {
    id: "anthropics/skills/pdf",
    slug: "pdf",
    name: "pdf",
    source: "anthropics/skills",
    installs: 74200,
    sourceType: "github",
    url: "https://skills.sh/anthropics/skills/pdf",
    isDuplicate: false,
  },
  {
    id: "anthropics/skills/skill-creator",
    slug: "skill-creator",
    name: "skill-creator",
    source: "anthropics/skills",
    installs: 61900,
    sourceType: "github",
    url: "https://skills.sh/anthropics/skills/skill-creator",
    isDuplicate: false,
  },
  {
    id: "openai/skills/spreadsheets",
    slug: "spreadsheets",
    name: "spreadsheets",
    source: "openai/skills",
    installs: 48600,
    sourceType: "github",
    url: "https://skills.sh/openai/skills/spreadsheets",
    isDuplicate: false,
  },
  {
    id: "openai/skills/docs",
    slug: "docs",
    name: "docs",
    source: "openai/skills",
    installs: 35400,
    sourceType: "github",
    url: "https://skills.sh/openai/skills/docs",
    isDuplicate: false,
  },
];

const previewTools = [
  { id: "claude-code", name: "Claude Code", skillsPath: "~/.claude/skills", detected: true },
  { id: "cursor", name: "Cursor", skillsPath: "~/.cursor/skills", detected: true },
  { id: "codex", name: "OpenAI Codex CLI", skillsPath: "~/.codex/skills", detected: false },
  { id: "opencode", name: "OpenCode", skillsPath: "~/.config/opencode/skills", detected: false },
];

let previewSettings = { proxyUrl: "", githubTokenConfigured: false };

function isBrowserPreview() {
  return import.meta.env.DEV && typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

async function previewInvoke<T>(command: string, args?: Record<string, unknown>) {
  await Promise.resolve();
  if (command === "get_leaderboard") return previewSkills as T;
  if (command === "search_skills") {
    const query = String(args?.query ?? "").toLowerCase();
    return previewSkills.filter((skill) => `${skill.name} ${skill.source}`.toLowerCase().includes(query)) as T;
  }
  if (command === "get_skill_detail") {
    const skill = previewSkills.find((item) => item.id === args?.skillId) ?? previewSkills[0];
    return {
      ...skill,
      description: "一组面向 AI Agent 的可复用工作流，包含清晰的使用说明和安全边界。",
      license: "MIT",
      githubStars: 18400,
      audits: [
        { provider: "Socket", slug: "socket", status: "pass", summary: "未发现已知的高风险依赖。" },
        { provider: "Snyk", slug: "snyk", status: "pass", summary: "依赖扫描通过。" },
      ],
      url: skill.url,
    } as T;
  }
  if (command === "detect_tools") return { tools: previewTools } as T;
  if (command === "list_installed" || command === "refresh_installed") {
    return {
      skills: previewSkills.slice(0, 3).map((skill, index) => ({
        id: skill.id,
        name: skill.name,
        owner: skill.source.split("/")[0],
        repo: skill.source.split("/")[1],
        source: "skills.sh",
        description: "用于验证本地管理界面的示例技能。",
        currentVersion: index === 0 ? "a1b2c3d" : "d4e5f6a",
        currentHash: "9c8b7a6d5e4f3210",
        distributedTo: previewTools.filter((tool) => tool.detected).map((tool) => tool.id),
        installedAt: "2026-08-18T08:00:00Z",
        versionHistory: [],
      })),
    } as T;
  }
  if (command === "get_settings") return previewSettings as T;
  if (command === "set_settings") {
    const next = (args?.update as Record<string, unknown> | undefined) ?? {};
    previewSettings = {
      proxyUrl: String(next.proxyUrl ?? ""),
      githubTokenConfigured: Boolean(next.githubToken) || (previewSettings.githubTokenConfigured && !next.clearGithubToken),
    };
    return previewSettings as T;
  }
  if (command === "preview_local_import") {
    return {
      sourcePath: String(args?.path ?? "C:\\Skills\\local-research"),
      sourceKind: "directory",
      skillRoot: String(args?.path ?? "C:\\Skills\\local-research"),
      name: "local-research",
      description: "用于验证本地导入流程的示例技能。",
      fileCount: 3,
      existingLocal: false,
      remoteConflict: false,
    } as T;
  }
  if (command === "import_local") {
    return { id: "local/local-research", name: "local-research", owner: "local", currentVersion: "local", currentHash: "preview", distributedTo: args?.agents ?? [], centralPath: "~/.skillsage/local/local-research", linkPaths: [] } as T;
  }
  if (command === "inspect_github_url") {
    return {
      parsed: { owner: "vercel-labs", repo: "agent-skills", skillPath: undefined, commit: "main", canonicalUrl: String(args?.url ?? "https://github.com/vercel-labs/agent-skills") },
      skills: [{ name: "frontend-design", description: "用于验证 GitHub URL 安装流程的示例技能。", skillPath: "skills/frontend-design", url: "https://github.com/vercel-labs/agent-skills/tree/main/skills/frontend-design" }],
    } as T;
  }
  if (command === "url_install") {
    return { id: "vercel-labs/agent-skills/frontend-design", name: "frontend-design", owner: "vercel-labs", currentVersion: "preview", currentHash: "preview", distributedTo: args?.agents ?? [], centralPath: "~/.skillsage/remote/vercel-labs/frontend-design", linkPaths: [] } as T;
  }
  if (command === "check_updates") return { updates: [] } as T;
  return {} as T;
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>) {
  if (isBrowserPreview()) {
    return previewInvoke<T>(command, args);
  }
  return invoke<T>(command, args);
}

export function normalizeTauriError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败，请稍后重试。";
}
