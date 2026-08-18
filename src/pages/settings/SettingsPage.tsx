import { Info, Palette, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/common/PageHeader";
import { ThemeControl } from "../../components/common/ThemeControl";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";

const cardClass = "rounded-lg border border-border bg-card p-6 shadow-sm";

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        description="管理 SkillSage 的外观与运行偏好，敏感凭据将在后续阶段接入本地安全存储。"
        eyebrow="03 / SETTINGS"
        title="设置"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className={cardClass} aria-labelledby="appearance-title">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Palette aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground" id="appearance-title">外观</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">选择界面亮度。系统模式会跟随操作系统设置变化。</p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4 rounded-md bg-muted p-4">
            <div>
              <p className="text-sm font-medium text-foreground">显示模式</p>
              <p className="mt-1 text-xs text-muted-foreground">偏好会保存在当前设备</p>
            </div>
            <ThemeControl />
          </div>
        </section>

        <section className={cardClass} aria-labelledby="security-title">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground" id="security-title">安全与连接</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">网络与 GitHub 配置将在 Phase 5 开放。</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <span className="text-sm text-foreground">GitHub Token</span>
              <Badge variant="muted">未配置</Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">代理</span>
              <Badge variant="muted">未配置</Badge>
            </div>
          </div>
        </section>
      </div>

      <section className={cn(cardClass, "mt-6 flex items-start gap-4")} aria-labelledby="about-title">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Info aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-medium text-foreground" id="about-title">关于 SkillSage</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">桌面端 AI Agent 技能管理器，当前版本专注于建立可靠、清晰的产品基线。</p>
          <p className="mt-3 text-xs text-muted-foreground">v0.1.0 · Phase 4 management</p>
        </div>
      </section>
    </div>
  );
}
