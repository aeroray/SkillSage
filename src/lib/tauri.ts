import { invoke } from "@tauri-apps/api/core";

const previewSkills = [
  {
    id: "vercel-labs/agent-skills/frontend-design",
    slug: "frontend-design",
    name: "frontend-design",
    source: "vercel-labs/agent-skills",
    installs: 128400,
    sourceType: "github",
    description: "A reusable collection of AI Agent workflows with usage guidance and safety notes.",
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
    description: "Guidelines for interface design and component systems.",
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
    description: "Tools and guidance for working with PDF documents.",
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
    description: "Guidance for creating and maintaining agent skills.",
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
    description: "Tools for creating, editing, and analyzing spreadsheets.",
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
    description: "Tools for creating and editing document files.",
    url: "https://skills.sh/openai/skills/docs",
    isDuplicate: false,
  },
];

let previewSettings = { proxyUrl: "", githubTokenConfigured: false };
let previewSkillTranslations: Record<string, string> = {};

/** Per-skill distribution, mirroring the backend's `distributedTo` list. */
const previewDistributed = new Map<string, Set<string>>();

/** A trimmed version of the real registry, including one tool that already
 * reads the shared directory and one whose path is unverified, so both UI
 * states are visible in the preview. */
const PREVIEW_TOOLS: {
  id: string;
  label: string;
  skillsDir: string | null;
  readsShared: boolean;
  detected: boolean;
  source: string;
  verified: boolean;
}[] = [
  { id: "claude-code", label: "Claude Code", skillsDir: ".claude/skills", readsShared: false, detected: true, source: "https://code.claude.com/docs/en/skills", verified: true },
  { id: "codebuddy", label: "CodeBuddy / WorkBuddy", skillsDir: ".codebuddy/skills", readsShared: false, detected: false, source: "https://www.workbuddy.ai/docs/cli/skills", verified: true },
  { id: "codex", label: "OpenAI Codex CLI", skillsDir: ".codex/skills", readsShared: false, detected: true, source: "https://cursor.com/docs/skills", verified: false },
  { id: "cursor", label: "Cursor", skillsDir: ".cursor/skills", readsShared: true, detected: true, source: "https://cursor.com/docs/skills", verified: true },
  { id: "copilot", label: "GitHub Copilot", skillsDir: ".copilot/skills", readsShared: true, detected: true, source: "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills", verified: true },
];
const previewMatchedLocalSkills = new Set<string>();
const previewLocalMatch = {
  id: "vercel-labs/agent-skills/local-research",
  slug: "local-research",
  name: "local-research",
  source: "vercel-labs/agent-skills",
  installs: 12800,
  sourceType: "github",
  url: "https://www.skills.sh/vercel-labs/agent-skills/local-research",
  isDuplicate: false,
};

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
      description: skill.description ?? "A reusable collection of AI Agent workflows with usage guidance and safety notes.",
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
  if (command === "translate_skill_description") {
    const text = String(args?.text ?? "").trim();
    return `这是技能说明的中文译文（预览）：${text}` as T;
  }
  if (command === "get_skill_translations") return previewSkillTranslations as T;
  if (command === "save_skill_translation") {
    const skillId = String(args?.skillId ?? "");
    const translatedDescription = String(args?.translatedDescription ?? "");
    previewSkillTranslations = {
      ...previewSkillTranslations,
      [skillId]: translatedDescription,
    };
    return undefined as T;
  }
  if (command === "install_skill") {
    const skillId = String(args?.skillId ?? "");
    const skill = previewSkills.find((item) => item.id === skillId) ?? previewSkills[0];
    const [owner] = skill.source.split("/");
    // A store install auto-distributes to every tool that needs its own copy,
    // matching the backend.
    previewDistributed.set(
      skill.id,
      new Set(
        PREVIEW_TOOLS.filter((tool) => tool.skillsDir && !tool.readsShared).map(
          (tool) => tool.id,
        ),
      ),
    );
    return {
      id: skill.id,
      name: skill.name,
      owner,
      currentVersion: "preview",
      currentHash: "preview",
      installPath: `C:\\Users\\PC\\.agents\\skills\\${skill.name}`,
    } as T;
  }
  if (command === "refresh_installed") {
    const localMatched = previewMatchedLocalSkills.has("local/local-research");
    return {
      skillsRoot: "C:\\Users\\PC\\.agents\\skills",
      skills: [
        ...previewSkills.slice(0, 3).map((skill, index) => ({
          id: skill.id,
          name: skill.name,
          owner: skill.source.split("/")[0],
          repo: skill.source.split("/")[1],
          // A real remote record stores the full skills.sh URL, not a bare
          // host. Mirroring that keeps the dev preview's update-source
          // classification identical to production.
          source: skill.url,
          description: "用于界面设计和组件规范。",
          currentVersion: index === 0 ? "a1b2c3d" : "d4e5f6a",
          currentHash: "9c8b7a6d5e4f3210",
          installedAt: "2026-08-18T08:00:00Z",
          distributedTo: [...previewDistributed.get(skill.id) ?? []],
        })),
        {
          id: localMatched ? previewLocalMatch.id : "local/local-research",
          name: "local-research",
          owner: localMatched ? "vercel-labs" : "local",
          repo: localMatched ? "agent-skills" : "local",
          skillPath: localMatched ? previewLocalMatch.slug : undefined,
          source: localMatched
            ? previewLocalMatch.url
            : "local://local-research",
          description: "用于整理本地研究资料。",
          currentVersion: localMatched ? "preview-remote" : "local",
          currentHash: "preview-local",
          installedAt: "2026-08-18T08:00:00Z",
          distributedTo: [...previewDistributed.get("local/local-research") ?? []],
        },
      ],
      // Mirrors the backend: only tools that do NOT read the shared directory
      // are offered, and only tools with their own directory can be.
      distributableTools: PREVIEW_TOOLS.filter(
        (tool) => !tool.readsShared,
      ).map(({ id, label }) => ({ id, label })),
      detectedTools: PREVIEW_TOOLS.filter((tool) => tool.detected).map(
        (tool) => tool.id,
      ),
    } as T;
  }
  if (command === "set_tool_distribution") {
    const skillId = String(args?.skillId ?? "");
    const toolId = String(args?.toolId ?? "");
    const distributed = args?.distributed === true;
    const targets = previewDistributed.get(skillId) ?? new Set<string>();
    if (distributed) targets.add(toolId);
    else targets.delete(toolId);
    previewDistributed.set(skillId, targets);
    const skill = previewSkills.find((item) => item.id === skillId);
    const [owner = "local", repo = "local"] = (skill?.source ?? "local/local").split("/");
    return {
      id: skillId,
      name: skill?.name ?? skillId.split("/").at(-1) ?? skillId,
      owner,
      repo,
      source: skill?.source ?? "local://local-research",
      description: skill?.description ?? "用于整理本地研究资料。",
      currentVersion: "preview",
      currentHash: "preview",
      installedAt: "2026-08-18T08:00:00Z",
      distributedTo: [...targets],
    } as T;
  }
  if (command === "list_tools") {
    return PREVIEW_TOOLS.map((tool) => ({
      ...tool,
      skillsDir: tool.skillsDir
        ? `C:\\Users\\PC\\${tool.skillsDir.replace(/\//g, "\\")}`
        : null,
      readsSharedDefault: tool.readsShared,
      customized: false,
      distributable: Boolean(tool.skillsDir) && !tool.readsShared,
    })) as T;
  }
  if (command === "set_tool_override") {
    const toolId = String(args?.toolId ?? "");
    const target = PREVIEW_TOOLS.find((tool) => tool.id === toolId);
    if (target) {
      if (args?.readsShared !== undefined) {
        target.readsShared = args.readsShared === true;
      }
      if (args?.skillsDir !== undefined) {
        target.skillsDir = args.skillsDir ? String(args.skillsDir) : null;
      }
    }
    return PREVIEW_TOOLS.map((tool) => ({
      ...tool,
      skillsDir: tool.skillsDir
        ? `C:\\Users\\PC\\${tool.skillsDir.replace(/\//g, "\\")}`
        : null,
      readsSharedDefault: tool.id === "cursor" || tool.id === "copilot",
      customized: false,
      distributable: Boolean(tool.skillsDir) && !tool.readsShared,
    })) as T;
  }
  if (command === "search_local_skill_matches") {
    return [
      {
        ...previewLocalMatch,
        verification: "exact",
        remoteVersion: "preview-remote",
        remoteHash: "preview-local",
        descriptionMatch: true,
        matchBasis: "store-search",
      },
    ] as T;
  }
  if (command === "link_local_skill") {
    previewMatchedLocalSkills.add(String(args?.skillId ?? ""));
    return {
      id: previewLocalMatch.id,
      name: "local-research",
      owner: "vercel-labs",
      repo: "agent-skills",
      skillPath: previewLocalMatch.slug,
      source: previewLocalMatch.url,
      description: "用于整理本地研究资料。",
      currentVersion: String(args?.remoteVersion ?? "unverified"),
      currentHash: "preview-local",
      installedAt: "2026-08-18T08:00:00Z",
      distributedTo: [],
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
      translatedDescriptionsCount: Object.keys(previewSkillTranslations).length,
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
      translationsImported: (options as { applySettings?: boolean }).applySettings
        ? Object.keys(previewSkillTranslations).length
        : 0,
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
  // `import.meta.env.DEV` is inlined by Vite as a literal, so in a production
  // build this branch folds away and `previewInvoke` — with its large fixture
  // set — is tree-shaken out of the bundle. Checking `isBrowserPreview()`
  // alone hid the flag inside a function body, which the bundler cannot fold.
  if (import.meta.env.DEV && isBrowserPreview()) {
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
