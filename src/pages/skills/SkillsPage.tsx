import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, Library, PackageOpen, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useDetectedTools } from "../../features/tools/hooks";
import {
  useInstalledSkills,
  usePhase2Install,
  useUninstallSkill,
} from "../../features/skills/hooks";

const phaseLabels: Record<string, string> = {
  downloading: "准备",
  parsing: "校验",
  distributing: "分发",
  done: "完成",
  failed: "失败",
};

export function SkillsPage() {
  const navigate = useNavigate();
  const { error: toolsError, loading: toolsLoading, refresh: refreshTools, tools } = useDetectedTools();
  const {
    error: skillsError,
    loading: skillsLoading,
    refresh: refreshSkills,
    skills,
  } = useInstalledSkills();
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const initializedAgents = useRef(false);

  useEffect(() => {
    if (!initializedAgents.current && tools.length > 0) {
      setSelectedAgents(tools.filter((tool) => tool.detected).map((tool) => tool.id));
      initializedAgents.current = true;
    }
  }, [tools]);

  const refreshPage = useCallback(() => {
    void refreshSkills();
  }, [refreshSkills]);
  const installState = usePhase2Install(refreshPage);
  const uninstallState = useUninstallSkill(refreshPage);
  const testSkillInstalled = skills.some((skill) => skill.id === "skillsage/skillsage-phase2-test");
  const pageError = toolsError ?? skillsError ?? installState.error ?? uninstallState.error;

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  };

  return (
    <div>
      <PageHeader
        description="集中查看已安装技能、版本状态和分发到的 AI 工具。"
        eyebrow="02 / LIBRARY"
        title="我的技能"
        actions={
          <Button onClick={() => navigate("/store")}>
            去技能商店
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        }
      />

      {pageError ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      ) : null}

      <section className="surface-card mb-6 flex items-center justify-between gap-4 p-5 max-md:items-start max-md:flex-col" aria-label="技能库状态">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Library aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">中央仓库</p>
            <p className="mt-1 text-xs text-muted-foreground">~/.skillsage/remote · 单一数据源</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{skills.length} 个技能</Badge>
          <Button
            aria-label="刷新技能与工具状态"
            disabled={skillsLoading || toolsLoading}
            onClick={() => {
              void refreshSkills();
              void refreshTools();
            }}
            size="icon"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="surface-card mb-6 p-6" aria-labelledby="phase2-title">
        <div className="flex items-start justify-between gap-4 max-md:flex-col">
          <div>
            <div className="flex items-center gap-2">
              <Badge>Phase 2</Badge>
              <span className="text-xs text-muted-foreground">端到端安装验证</span>
            </div>
            <h2 id="phase2-title" className="mt-4 text-xl font-semibold tracking-tight text-foreground">安装测试技能</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              使用内置 fixture 走完校验、临时目录、原子落库、内容哈希、工具分发和 lock 记录。它不会访问网络，适合确认本机权限和链接能力。
            </p>
          </div>
          {installState.installing ? (
            <Badge variant="success">{phaseLabels[installState.stage] ?? "处理中"}</Badge>
          ) : testSkillInstalled ? (
            <Badge variant="success">已安装</Badge>
          ) : null}
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">分发目标</p>
              <p className="mt-1 text-xs text-muted-foreground">默认勾选已检测到的工具，也可以手动创建目标目录。</p>
            </div>
            <span className="text-xs text-muted-foreground">{selectedAgents.length} 个已选择</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <label
                className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 transition-all duration-150 hover:bg-muted"
                key={tool.id}
              >
                <span className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedAgents.includes(tool.id)}
                    disabled={installState.installing}
                    onChange={() => toggleAgent(tool.id)}
                  />
                  <span className="text-sm text-foreground">{tool.name}</span>
                </span>
                {tool.detected ? <Badge variant="success">已检测</Badge> : <Badge variant="muted">未检测</Badge>}
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4 max-md:items-start max-md:flex-col">
            <p className="text-xs text-muted-foreground">
              {installState.message || "安装后可在下方看到中央仓库、版本哈希和链接记录。"}
            </p>
            <Button
              disabled={installState.installing || testSkillInstalled}
              onClick={() => void installState.install(selectedAgents)}
            >
              {installState.installing ? "安装中…" : testSkillInstalled ? "测试技能已安装" : "安装测试技能"}
            </Button>
          </div>
        </div>
      </section>

      {skills.length > 0 ? (
        <section className="surface-card overflow-hidden" aria-labelledby="installed-title">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id="installed-title" className="text-base font-medium text-foreground">已安装技能</h2>
              <p className="mt-1 text-xs text-muted-foreground">来自 lock 文件的当前状态</p>
            </div>
            <Badge variant="success">中央仓库在线</Badge>
          </div>
          <div className="divide-y divide-border">
            {skills.map((skill) => (
              <div className="flex items-center justify-between gap-5 px-5 py-4 max-md:items-start max-md:flex-col" key={skill.id}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-foreground">{skill.name}</h3>
                    <Badge variant="muted">{skill.owner}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {skill.currentVersion} · hash {skill.currentHash.slice(0, 12)} · {skill.distributedTo.length} 个分发目标
                  </p>
                </div>
                <Button
                  disabled={uninstallState.uninstalling}
                  onClick={() => void uninstallState.uninstall(skill.id)}
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  卸载
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          action={
            <Button onClick={() => navigate("/store")} variant="secondary">
              发现更多技能
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          }
          description="安装技能后，它们会出现在这里，并可以按作者分组管理、更新、回退和分发。"
          icon={PackageOpen}
          title="还没有已安装技能"
        />
      )}

      {skills.length > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
          链接目标始终指向中央仓库，更新内容时无需重复分发。
        </p>
      ) : null}
    </div>
  );
}
