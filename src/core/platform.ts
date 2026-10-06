// what we're running on. the Electron preload exposes window.appBridge, the web build has none

export const isElectron = !!window.appBridge?.isElectron;

export const isTouch =
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// iPadOS reports itself as a Mac, the touch points give it away
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(navigator.userAgent);

export const canFullscreen = isElectron || !!document.fullscreenEnabled;

// fullscreen + landscape lock, only works from inside a user gesture and not at all on iPhone.
// either one failing never stops the other from being tried
export function enterMobileFullscreen(): void {
  if (isElectron || !isTouch) return;
  let request: Promise<void> | null = null;
  try {
    if (document.fullscreenEnabled && !document.fullscreenElement) request = document.documentElement.requestFullscreen();
  } catch {
    // not supported, fine
  }
  // Android only allows the lock once fullscreen, so wait for it either way
  if (request) request.then(lockLandscape, lockLandscape);
  else lockLandscape();
}

function lockLandscape(): void {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    void o.lock?.('landscape').catch(() => {});
  } catch {
    // iPhone Safari has no lock
  }
}

export function isPortrait(): boolean {
  return isTouch && window.innerHeight > window.innerWidth;
}

// safe-area insets in CSS px, read through a hidden probe since env() isn't readable from JS
let probe: HTMLDivElement | null = null;

export function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}
