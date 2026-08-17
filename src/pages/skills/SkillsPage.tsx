import { ArrowRight, Library, PackageOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/common/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export function SkillsPage() {
  const navigate = useNavigate();

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

      <section className="surface-card mb-6 flex items-center justify-between gap-4 p-5 max-md:items-start max-md:flex-col" aria-label="技能库状态">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Library aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">中央仓库</p>
            <p className="mt-1 text-xs text-muted-foreground">内容和分发状态将在 Phase 2 开始记录</p>
          </div>
        </div>
        <Badge variant="muted">0 个技能</Badge>
      </section>

      <EmptyState
        action={
          <Button onClick={() => navigate("/store")}>
            发现第一个技能
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        }
        description="安装技能后，它们会出现在这里，并可以按作者分组管理、更新、回退和分发。"
        icon={PackageOpen}
        title="还没有已安装技能"
      />
    </div>
  );
}
