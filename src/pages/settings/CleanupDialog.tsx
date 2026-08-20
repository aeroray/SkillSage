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
            选择保留共享目录中的技能文件，还是删除 SkillSage 安装的技能。GitHub Token 与代理设置会同时清除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
          <p><strong className="font-medium text-foreground">保留并停止管理：</strong>共享技能目录中的文件完全不受影响，其他 AI 工具继续正常使用；只移除 SkillSage 自己的管理记录。</p>
          <p><strong className="font-medium text-foreground">删除技能与数据：</strong>从共享目录中删除 SkillSage 安装的每一个技能文件夹——不是链接，是真实文件——所有读取该目录的 AI 工具会立即失去这些技能，且操作不可恢复。手动放入共享目录、未被 SkillSage 跟踪的文件夹不受影响。</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cleaning}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("keep-skills")} variant="outline">保留并停止管理</AlertDialogAction>
          <AlertDialogAction disabled={cleaning} onClick={() => onConfirm("all")} variant="destructive">{cleaning ? "删除中…" : "删除技能与数据"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
