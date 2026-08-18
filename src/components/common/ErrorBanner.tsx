import { CircleAlert, RefreshCw, Settings2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type ErrorBannerProps = {
  className?: string;
  error?: string;
  onOpenSettings?: () => void;
  onRetry?: () => void;
};

function canUseNetworkSettings(error: string) {
  return /GitHub|skills\.sh|网络|代理|限流|认证|不可达/.test(error);
}

export function ErrorBanner({ className, error, onOpenSettings, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <Alert className={cn("items-start", className)} variant="destructive">
      <CircleAlert aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-2">
        <AlertTitle>操作失败</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          {onRetry ? <Button onClick={onRetry} size="sm" variant="outline"><RefreshCw data-icon="inline-start" />重试</Button> : null}
          {onOpenSettings && canUseNetworkSettings(error) ? <Button onClick={onOpenSettings} size="sm" variant="ghost"><Settings2 data-icon="inline-start" />网络设置</Button> : null}
        </div>
      </div>
    </Alert>
  );
}
