import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

/** Width of the brand block, matching the sidebar rail below it. */
export const TITLE_BAR_BRAND_WIDTH = 228;

/** macOS draws its own traffic lights over the webview (titleBarStyle:
 * Overlay), so the bar reserves room for them and skips our own controls. */
function isMacos() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** True inside the Tauri webview. Window calls throw in a plain browser, which
 * is how the dev preview and the component tests run. */
function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Window controls for the custom title bar. Windows and Linux lose their native
 * frame because `decorations: false`, so the app draws minimize, maximize and
 * close itself; macOS keeps its native traffic lights and renders none of this.
 */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const supported = isDesktopRuntime() && !isMacos();

  useEffect(() => {
    if (!supported) return;
    const win = getCurrentWindow();
    let active = true;
    const sync = () => {
      void win.isMaximized().then((value) => {
        if (active) setMaximized(value);
      });
    };
    sync();
    // The window can also be maximized by double-clicking the drag region or
    // by the OS, so the button state follows the window rather than clicks.
    const unlisten = win.onResized(sync);
    return () => {
      active = false;
      void unlisten.then((off) => off());
    };
  }, [supported]);

  if (!supported) return null;

  const win = getCurrentWindow();

  return (
    // `false` blocks dragging for this subtree and its ancestors' walk, so the
    // gaps between the controls never start a window drag.
    <div className="flex items-center gap-px" data-tauri-drag-region="false">
      <Button
        aria-label="最小化"
        onClick={() => void win.minimize()}
        size="icon-xs"
        variant="ghost"
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        aria-label={maximized ? "向下还原" : "最大化"}
        onClick={() => void win.toggleMaximize()}
        size="icon-xs"
        variant="ghost"
      >
        {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </Button>
      <Button
        aria-label="关闭"
        className="hover:bg-destructive/15 hover:text-destructive-text"
        onClick={() => void win.close()}
        size="icon-xs"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

type TitleBarProps = {
  /** The action slot pages portal into. */
  actionsRef: (node: HTMLElement | null) => void;
  brand: ReactNode;
  title: string;
};

export function TitleBar({ actionsRef, brand, title }: TitleBarProps) {
  const mac = isMacos();

  // Tauri injects a drag handler that walks up from the event target. A bare
  // `data-tauri-drag-region` only drags when the target *is* that element, so
  // the title text and brand mark would be dead zones. `="deep"` drags from any
  // non-interactive descendant while clickable elements (buttons, links,
  // inputs) still block it — which is exactly what the action slot needs.
  // That handler also owns double-click-to-maximize, so no onDoubleClick here.
  return (
    <header
      className="relative z-30 flex h-9 shrink-0 items-stretch border-b border-border bg-sidebar"
      data-tauri-drag-region="deep"
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-r border-border px-3",
          // macOS traffic lights sit over this area; keep clear of them.
          mac && "pl-[76px]",
        )}
        style={{ width: TITLE_BAR_BRAND_WIDTH }}
      >
        {brand}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
        <h1 className="truncate text-sm font-medium text-foreground">
          {title}
        </h1>
        {/* Pages portal their buttons into this slot. */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5" ref={actionsRef} />
      </div>

      <div className="flex shrink-0 items-center pr-1.5">
        <WindowControls />
      </div>
    </header>
  );
}

/** The brand block: mark plus the bilingual product name. */
export function TitleBarBrand({
  logoSrc,
  product,
  productZh,
}: {
  logoSrc: string;
  product: string;
  productZh: string;
}) {
  return (
    <>
      <img alt="" className="size-4 shrink-0 rounded-sm object-cover" src={logoSrc} />
      <span className="truncate text-xs font-semibold tracking-tight text-foreground">
        {product}
      </span>
      <span className="truncate text-xs text-muted-foreground">{productZh}</span>
    </>
  );
}
