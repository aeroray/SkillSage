import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import type { PathConflict } from "../../features/skills/types";
import { displayPath } from "../../lib/paths";

type PathConflictDialogProps = {
  busy?: boolean;
  conflict?: PathConflict;
  onCancel: () => void;
  onSkip: () => void;
  onTakeover: () => void;
};

/**
 * A single shared conflict dialog for every place that can hit a name
 * already occupied by an untracked folder/link in the shared skills
 * directory (store install, local import, GitHub URL install, adopt).
 * There's only one target now, so there's only one conflict shape — skip
 * and cancel never need to reach the backend at all, only takeover does.
 */
export function PathConflictDialog({
  busy,
  conflict,
  onCancel,
  onSkip,
  onTakeover,
}: PathConflictDialogProps) {
  return (
    <Dialog
      description="共享技能目录中已有同名内容，不是由 SkillSage 管理的。"
      onClose={onCancel}
      open={Boolean(conflict)}
      title="处理安装冲突"
    >
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {conflict ? `${conflict.name}: ${displayPath(conflict.path)}` : ""}
          </AlertDescription>
        </Alert>
        <p className="text-sm leading-6 text-muted-foreground">
          跳过：不处理这一项；备份后继续：把现有内容改名保留，再安装这个技能；取消：返回上一步。
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel} variant="ghost">
            取消
          </Button>
          <Button disabled={busy} onClick={onSkip} variant="outline">
            跳过
          </Button>
          <Button disabled={busy} onClick={onTakeover}>
            备份后继续
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
