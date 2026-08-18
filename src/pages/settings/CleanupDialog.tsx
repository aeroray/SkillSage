import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import type { CleanupMode } from "../../features/cleanup";

type CleanupDialogProps = {
  cleaning: boolean;
  onClose: () => void;
  onConfirm: (mode: CleanupMode) => void;
  open: boolean;
};

export function CleanupDialog({ cleaning, onClose, onConfirm, open }: CleanupDialogProps) {
  return (
    <AlertDialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>准备卸载 SkillSage</AlertDialogTitle>
          <AlertDialogDescription>
            选择卸载前如何处理中央技能仓库和分发链接。此操作会清除本机保存的 GitHub Token 与代理设置。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
          <p><strong className="font-medium text-foreground">保留技能：</strong>保留中央技能文件和现有链接，移除 SkillSage 的 lock、设置与导出记录，技能仍可被 AI 工具使用。</p>
          <p><strong className="font-medium text-foreground">清理全部：</strong>移除中央技能仓库，并删除 SkillSage 创建的所有分发链接，AI 工具恢复为未安装状态。</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cleaning}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("keep-skills")} variant="outline">保留技能</AlertDialogAction>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("all")} variant="destructive">{cleaning ? "清理中…" : "清理全部"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
