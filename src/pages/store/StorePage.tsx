import { ArrowRight, Boxes, Search, Store as StoreIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export function StorePage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        description="从 skills.sh 发现、搜索并安装面向 AI Agent 的能力模块。"
        eyebrow="01 / STORE"
        title="技能商店"
        actions={
          <Button onClick={() => navigate("/skills")} variant="outline">
            <Boxes aria-hidden="true" className="h-4 w-4" />
            我的技能
          </Button>
        }
      />

      <section className="surface-card store-hero p-8 md:p-10" aria-labelledby="store-hero-title">
        <div className="store-hero-grid">
          <div>
            <Badge>Phase 1 · UI baseline</Badge>
            <h2 id="store-hero-title" className="mt-5 max-w-lg text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              让每一个 Agent，
              <span className="block text-primary">都拥有恰到好处的技能。</span>
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground">
              SkillSage 将技能集中管理，再按需分发到常用工具。商店数据与安装流程将在后续阶段接入。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button onClick={() => navigate("/skills")}>
                查看管理页
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">接下来：Phase 2 · 核心安装管线</span>
            </div>
          </div>

          <div aria-label="商店预览示意" className="preview-window p-4" role="img">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <span className="preview-dot" />
              <span className="preview-line preview-line-primary" />
              <span className="ml-auto h-6 w-6 rounded-md bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4">
              {["网页研究", "代码审查", "内容整理", "数据分析"].map((label) => (
                <div className="rounded-md border border-border bg-card p-3" key={label}>
                  <div className="mb-5 h-7 w-7 rounded-md bg-primary-soft" />
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <span className="preview-line preview-line-short mt-2 block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="surface-card flex items-start gap-4 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Search aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-medium text-foreground">实时搜索</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">每次搜索直达商店接口，不让过期结果干扰你的选择。</p>
          </div>
        </div>
        <div className="surface-card flex items-start gap-4 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Boxes aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-medium text-foreground">集中管理</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">技能只保存在中央仓库，再通过链接分发到指定工具。</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <EmptyState
          action={
            <Button onClick={() => navigate("/skills")} variant="secondary">
              先查看我的技能
            </Button>
          }
          description="Phase 3 将在这里带来排行榜、实时搜索、技能卡片和详情安装流程。"
          icon={StoreIcon}
          title="商店内容即将接入"
        />
      </div>
    </div>
  );
}
