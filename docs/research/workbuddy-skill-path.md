# Work Buddy / CodeBuddy skill directory — investigation

**Question:** the app links to `~/.workbuddy-ai/skills/`. Is that path real, and is there an
international-vs-China difference?

**Answer: the path is wrong, and there is no locale difference.**

## Evidence

### 1. The official CLI documentation states `~/.codebuddy/skills/`

`www.workbuddy.ai/docs` serves Tencent's CodeBuddy/WorkBuddy docs. The skills page
(`cli/skills`, and the `cn/` and `zh/` variants) documents exactly two locations:

- Project-level: `.codebuddy/skills/`
- User-level: `~/.codebuddy/skills/`

Downloaded chunks (VitePress content, not rendered HTML):

| chunk | `.codebuddy` | `.workbuddy` | `.agents` |
|---|---|---|---|
| `cli_skills.md` (intl) | 19 | 0 | 0 |
| `cn_cli_skills.md` | 18 | 0 | 0 |
| `zh_cli_skills.md` | 19 | 0 | 0 |

Identical across all three locales — so there is **no international/China path split**.
`.workbuddy` appears nowhere, and `.agents` appears nowhere (no shared-directory support).

### 2. A scan of every WorkBuddy doc page finds only two home directories

Across all downloaded WorkBuddy/CodeBuddy skill and settings doc chunks, the only home
dot-directories referenced are:

```
~/.codebuddy   18
~/.ssh          3
```

### 3. The npm CLI packages contain no "skills" concept

`@workbuddy/cli` and `@workbuddy/cli-vnext` (published by `workbuddy_developer
<developer@workbuddy.com>`) contain no `skills` string at all. So the CLI is a different
component from the desktop app that owns the skill directory. This means the CLI tarball
cannot confirm the app's path — the docs above are the authoritative source.

### 4. The user's own machine confirms the international build was installed

```
%LOCALAPPDATA%\@genieworkbuddy-desktop-updater\installer.exe   <- the installer that ran
%LOCALAPPDATA%\CodeBuddyExtension\
%APPDATA%\Tencent\
```

`@genieworkbuddy-desktop-updater` is the international desktop build. It is now uninstalled,
and neither `~/.workbuddy-ai/` nor `~/.codebuddy/` exists any more — consistent with the
user's report that the tool and its directory are gone.

## Conclusion

| | path |
|---|---|
| **was (wrong)** | `~/.workbuddy-ai/skills/` |
| **correct** | `~/.codebuddy/skills/` |
| locale split | none — same path for cn / intl / zh |

The `-ai` suffix in the old code was never a real directory. Any link the app created there
went into a directory nothing reads, which is why Work Buddy showed as available even after
uninstalling.

## Also relevant: CodeBuddy does not read the shared directory

`.agents` has zero mentions in its docs, so CodeBuddy needs per-tool distribution — the same
category as Claude Code. It cannot be dropped from the distribution list by assuming shared
support.
