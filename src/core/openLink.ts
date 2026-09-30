// external links always go to the system browser, never inside the game window
export function openLink(url: string): void {
  if (window.appBridge) {
    window.appBridge.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
