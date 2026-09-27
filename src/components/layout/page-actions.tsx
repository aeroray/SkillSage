import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Pages portal their actions into the title bar instead of rendering a page
 * header. A portal is used rather than a registry of callbacks so the actions
 * stay in the page's own render tree: their closures always see current state,
 * and nothing has to be re-registered when props change.
 */
const TitleBarActionsContext = createContext<HTMLElement | null>(null);

export const TitleBarActionsProvider = TitleBarActionsContext.Provider;

/** Renders `children` into the title bar's action slot. Renders nothing on the
 * first commit, before the slot's ref has reported the node. */
export function PageActions({ children }: { children: ReactNode }) {
  const host = useContext(TitleBarActionsContext);
  if (!host) return null;
  return createPortal(children, host);
}
