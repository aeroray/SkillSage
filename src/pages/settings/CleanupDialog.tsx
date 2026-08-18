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
          <AlertDialogTitle>停止由 SkillSage 管理技能</AlertDialogTitle>
          <AlertDialogDescription>
            选择保留当前技能，还是清理 SkillSage 创建的技能仓库、分发链接和管理数据。GitHub Token 与代理设置会同时清除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
          <p><strong className="font-medium text-foreground">保留并停止管理：</strong>移除 SkillSage 的管理记录，保留技能文件和现有链接。AI 工具仍可继续使用。</p>
          <p><strong className="font-medium text-foreground">清理 SkillSage 数据：</strong>删除 SkillSage 创建的技能仓库、分发链接和管理数据，操作不可恢复。</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cleaning}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("keep-skills")} variant="outline">保留并停止管理</AlertDialogAction>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("all")} variant="destructive">{cleaning ? "清理中…" : "清理技能与链接"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
