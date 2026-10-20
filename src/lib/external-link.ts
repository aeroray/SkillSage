import { invokeCommand } from "./tauri";

/**
 * Opens an https URL in the user's default browser.
 *
 * A renderer-side `<a target="_blank">` does nothing here: this app registers
 * no new-window handler and ships no opener plugin, so the WebView denies the
 * navigation and the link renders as a dead button. The OS owns the launch
 * instead, through the backend command — which re-validates the URL, because a
 * compromised renderer must not be able to hand it a `file:` or `javascript:`
 * target. The check below is only a fail-fast: it saves a round trip and gives
 * the caller a readable message before the invoke is attempted.
 */
export async function openExternal(url: string) {
  if (!url.startsWith("https://")) {
    throw new Error("只能打开 https 链接。");
  }
  await invokeCommand<void>("open_external_url", { url });
}
