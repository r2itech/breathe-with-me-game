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
.bwm-sound{position:fixed;z-index:19;width:44px;height:44px;display:none;align-items:center;justify-content:center;padding:0;
  background:rgba(11,9,24,.6);color:#f2ecff;border:2px solid rgba(255,201,163,.6);border-radius:50%;cursor:pointer}
.bwm-sound.on{display:flex}
.bwm-sound svg{width:22px;height:22px}
@media (prefers-reduced-motion: reduce){.bwm-phone{animation:none}}
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

const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';

// "sound off" speaker, top-right. a tap on a real <button> is a gesture every
// engine accepts, so it doubles as the retry for the audio unlock
export class SoundIcon {
  private el: HTMLButtonElement;

  constructor(label: string, onTap: () => void) {
    style();
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'bwm-sound';
    this.el.innerHTML = SPEAKER_OFF;
    this.el.setAttribute('aria-label', label);
    this.el.title = label;
    this.el.addEventListener('click', onTap);
    document.body.appendChild(this.el);
  }

  set visible(on: boolean) {
    this.el.classList.toggle('on', on);
  }

  // css px from the top and right edges of the window
  place(top: number, right: number): void {
    this.el.style.top = `${Math.round(top)}px`;
    this.el.style.right = `${Math.round(right)}px`;
  }
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
