// plain DOM bits that sit over the canvas: the rotate prompt and a small toast

const CSS = `
.bwm-rotate{position:fixed;inset:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;
  gap:22px;background:#07060f;color:#f2ecff;font-family:Quicksand,sans-serif;font-weight:600;font-size:20px;text-align:center;padding:24px}
.bwm-rotate.on{display:flex}
.bwm-phone{width:44px;height:74px;border:4px solid #ffc9a3;border-radius:10px;animation:bwm-turn 2.2s ease-in-out infinite}
@keyframes bwm-turn{0%,20%{transform:rotate(0)}50%,70%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
.bwm-toast{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:21;
  background:rgba(12,10,26,.92);color:#f2ecff;border:1px solid rgba(255,201,163,.45);border-radius:12px;padding:10px 16px;
  font-family:Quicksand,sans-serif;font-weight:600;font-size:15px;opacity:0;transition:opacity .4s;pointer-events:none;white-space:nowrap}
.bwm-toast.on{opacity:1}
.bwm-sound{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(0);z-index:22;
  display:none;align-items:center;gap:8px;background:#1a1530;color:#f2ecff;border:1px solid rgba(255,201,163,.6);border-radius:999px;
  padding:10px 20px;font-family:Quicksand,sans-serif;font-weight:600;font-size:15px;cursor:pointer;
  box-shadow:0 6px 24px rgba(0,0,0,.4);animation:bwm-pulse 1.8s ease-in-out infinite}
.bwm-sound.on{display:flex}
@keyframes bwm-pulse{0%,100%{box-shadow:0 6px 24px rgba(0,0,0,.4)}50%{box-shadow:0 6px 24px rgba(255,201,163,.35)}}
@media (prefers-reduced-motion: reduce){.bwm-phone{animation:none}.bwm-sound{animation:none}}
`;

let styled = false;

function style(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export class RotatePrompt {
  private el: HTMLDivElement;

  constructor(text: string) {
    style();
    this.el = document.createElement('div');
    this.el.className = 'bwm-rotate';
    const phone = document.createElement('div');
    phone.className = 'bwm-phone';
    const label = document.createElement('div');
    label.textContent = text;
    this.el.append(phone, label);
    document.body.appendChild(this.el);
  }

  set visible(on: boolean) {
    this.el.classList.toggle('on', on);
  }
}

// explicit, guaranteed-reliable fallback for when the passive gesture
// listeners in Input.ts don't unlock audio (browsers disagree on exactly
// which events count, and some mobile engines block it outright until the
// tap lands on a real element). a click on an actual <button> is the one
// gesture every engine accepts, so this is the backstop that can't fail
// the same way the passive unlock can.
export class SoundButton {
  private el: HTMLButtonElement;

  constructor(text: string, onTap: () => void) {
    style();
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'bwm-sound';
    this.el.textContent = text;
    this.el.addEventListener('click', onTap);
    document.body.appendChild(this.el);
  }

  set visible(on: boolean) {
    this.el.classList.toggle('on', on);
  }
}

// temporary diagnostic readout for the mobile-silence investigation: small,
// unobtrusive, screenshot-able. remove once the cause is confirmed fixed.
let diagEl: HTMLDivElement | null = null;

export function setDiag(text: string): void {
  style();
  if (!diagEl) {
    diagEl = document.createElement('div');
    diagEl.style.cssText =
      'position:fixed;top:calc(6px + env(safe-area-inset-top));left:6px;z-index:23;' +
      'background:rgba(0,0,0,.6);color:#9ef7c8;font:11px/1.5 monospace;padding:5px 8px;' +
      'border-radius:6px;pointer-events:none;white-space:pre-line;max-width:80vw';
    document.body.appendChild(diagEl);
  }
  diagEl.textContent = text;
}

export function showToast(text: string, seconds: number): void {
  style();
  const el = document.createElement('div');
  el.className = 'bwm-toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  window.setTimeout(() => el.classList.remove('on'), seconds * 1000);
  window.setTimeout(() => el.remove(), seconds * 1000 + 600);
}
