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

let previewSettings = { proxyUrl: "", githubTokenConfigured: false };

export function isBrowserPreview() {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    !("__TAURI_INTERNALS__" in window)
  );
}

async function previewInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
) {
  await Promise.resolve();
  if (command === "get_leaderboard") return previewSkills as T;
  if (command === "search_skills") {
    const query = String(args?.query ?? "").toLowerCase();
    return previewSkills.filter((skill) =>
      `${skill.name} ${skill.source}`.toLowerCase().includes(query),
    ) as T;
  }
  if (command === "get_skill_detail") {
    const skill =
      previewSkills.find((item) => item.id === args?.skillId) ??
      previewSkills[0];
    return {
      ...skill,
      description: "一组可复用的 AI Agent 工作流，附带使用说明和安全提示。",
      license: "MIT",
      githubStars: 18400,
      audits: [
        {
          provider: "Socket",
          slug: "socket",
          status: "pass",
          summary: "未发现已知高风险依赖。",
        },
        {
          provider: "Snyk",
          slug: "snyk",
          status: "pass",
          summary: "依赖未发现问题。",
        },
      ],
      url: skill.url,
    } as T;
  }
  if (command === "list_installed" || command === "refresh_installed") {
    return {
      skillsRoot: "C:\\Users\\PC\\.agents\\skills",
      skills: previewSkills.slice(0, 3).map((skill, index) => ({
        id: skill.id,
        name: skill.name,
        owner: skill.source.split("/")[0],
        repo: skill.source.split("/")[1],
        source: "skills.sh",
        description: "用于界面设计和组件规范。",
        currentVersion: index === 0 ? "a1b2c3d" : "d4e5f6a",
        currentHash: "9c8b7a6d5e4f3210",
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
      githubTokenConfigured:
        Boolean(next.githubToken) ||
        (previewSettings.githubTokenConfigured && !next.clearGithubToken),
    };
    return previewSettings as T;
  }
  if (command === "preview_local_import") {
    return {
      sourcePath: String(args?.path ?? "C:\\Skills\\local-research"),
      sourceKind: "directory",
      skillRoot: String(args?.path ?? "C:\\Skills\\local-research"),
      name: "local-research",
      description: "用于整理本地研究资料。",
      fileCount: 3,
      existingLocal: false,
      remoteConflict: false,
    } as T;
  }
  if (command === "import_local") {
    return {
      id: "local/local-research",
      name: "local-research",
      owner: "local",
      currentVersion: "local",
      currentHash: "preview",
      installedPath: "C:\\Users\\PC\\.agents\\skills\\local-research",
    } as T;
  }
  if (command === "inspect_github_url") {
    return {
      parsed: {
        owner: "vercel-labs",
        repo: "agent-skills",
        skillPath: undefined,
        commit: "main",
        canonicalUrl: String(
          args?.url ?? "https://github.com/vercel-labs/agent-skills",
        ),
      },
      skills: [
        {
          name: "frontend-design",
          description: "用于界面设计和组件规范。",
          skillPath: "skills/frontend-design",
          url: "https://github.com/vercel-labs/agent-skills/tree/main/skills/frontend-design",
        },
      ],
    } as T;
  }
  if (command === "url_install") {
    return {
      id: "vercel-labs/agent-skills/frontend-design",
      name: "frontend-design",
      owner: "vercel-labs",
      currentVersion: "preview",
      currentHash: "preview",
      installedPath: "C:\\Users\\PC\\.agents\\skills\\frontend-design",
    } as T;
  }
  if (command === "export_package")
    return "C:\\Users\\PC\\.skillsage\\exports\\skillsage-sync-preview.json" as T;
  if (command === "preview_import_package") {
    return {
      path: String(args?.path ?? "C:\\Users\\PC\\skillsage-sync.json"),
      exportedAt: "2026-08-18T08:00:00Z",
      settings: { themeMode: "light", themeAccent: "teal", proxyUrl: "" },
      skills: [
        {
          id: "vercel-labs/agent-skills/frontend-design",
          name: "frontend-design",
          description: "从其他设备恢复的技能。",
          source: "https://skills.sh/vercel-labs/agent-skills/frontend-design",
          currentVersion: "a1b2c3d",
          installed: false,
        },
      ],
    } as T;
  }
  if (command === "import_package") {
    const options =
      (args?.options as { selectedIds?: string[] } | undefined) ?? {};
    return {
      imported: (options.selectedIds ?? []).map((id) => ({
        id,
        name: id.split("/").at(-1) ?? id,
      })),
      skipped: [],
      failed: [],
      settings: (options as { applySettings?: boolean }).applySettings
        ? { themeMode: "light", themeAccent: "teal", proxyUrl: "" }
        : undefined,
    } as T;
  }
  if (command === "scan_migrate") {
    return {
      items: [
        {
          name: "legacy-research",
          declaredName: undefined,
          description: "已经在共享技能目录中，但还未被 SkillSage 记录。",
          path: "C:\\Users\\PC\\.agents\\skills\\legacy-research",
          valid: true,
          removable: false,
          recommended: true,
          warning: undefined,
        },
        {
          name: "renamed-notes",
          declaredName: "notes-helper",
          description: "文件夹名和 SKILL.md 中的名称不一致。",
          path: "C:\\Users\\PC\\.agents\\skills\\renamed-notes",
          valid: true,
          removable: false,
          recommended: false,
          warning:
            "SKILL.md 中的名称为 notes-helper，建议按该名称整理后再采纳。",
        },
        {
          name: "broken-entry",
          declaredName: undefined,
          description: "",
          path: "C:\\Users\\PC\\.agents\\skills\\broken-entry",
          valid: false,
          removable: true,
          recommended: false,
          warning: "未找到有效的 SKILL.md，无法采纳。",
        },
      ],
      scannedRoot: "C:\\Users\\PC\\.agents\\skills",
    } as T;
  }
  if (command === "execute_migrate")
    return { adopted: ["legacy-research"], skipped: [], failed: [] } as T;
  if (command === "remove_adopt_candidate") return undefined as T;
  if (command === "rename_adopt_candidate") return "notes-helper" as T;
  if (command === "open_path" || command === "open_skill_directory")
    return undefined as T;
  if (command === "check_install_conflict") return undefined as T;
  if (command === "check_updates") return { updates: [] } as T;
  return {} as T;
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
) {
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
