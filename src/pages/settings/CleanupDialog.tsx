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
            卸载前选择保留技能，还是删除技能和分发链接。GitHub Token 与代理设置会同时清除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
          <p><strong className="font-medium text-foreground">保留技能：</strong>删除 SkillSage 的管理记录，保留技能文件和现有链接。AI 工具仍可使用这些技能。</p>
          <p><strong className="font-medium text-foreground">删除技能和链接：</strong>删除中央技能仓库、分发链接和管理数据，操作不可恢复。</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cleaning}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("keep-skills")} variant="outline">保留技能</AlertDialogAction>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("all")} variant="destructive">{cleaning ? "删除中…" : "删除技能和链接"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
