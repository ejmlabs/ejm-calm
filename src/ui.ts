const find = (...ids: string[]): HTMLElement | null => ids.map((id) => document.getElementById(id)).find(Boolean) ?? null;

export type UIActions = {
  begin: () => void;
  pause: () => void;
  sound: () => void;
  volume: (value: number) => void;
  share: () => string;
};

export type UITimings = {
  idleDimSeconds?: number;
  copiedToastSeconds?: number;
};

export type UIElements = {
  canvas: HTMLElement | null;
  veil: HTMLElement | null;
  gate: HTMLElement | null;
  begin: HTMLButtonElement | null;
  pause: HTMLButtonElement | null;
  sound: HTMLElement | null;
  volume: HTMLInputElement | null;
  share: HTMLAnchorElement | HTMLElement | null;
  seed: HTMLElement | null;
  aboutToggle: HTMLElement | null;
  about: HTMLElement | null;
  aboutClose: HTMLElement | null;
  controls: HTMLElement | null;
  status: HTMLElement | null;
  toast: HTMLElement | null;
};

export type UIController = {
  elements: UIElements;
  wake: () => void;
  announce: (message: string) => void;
  ready: () => void;
  begin: () => void;
  sync: (state: { paused: boolean; sound: boolean; volume: number; seed: number }) => void;
  error: (message: string) => void;
  dispose: () => void;
};

export function createUI(actions: UIActions, timings: UITimings = {}): UIController {
  const elements: UIElements = {
    canvas: find('space'), veil: find('veil', 'landing', 'intro'), gate: find('gate'), begin: find('begin', 'beginBtn', 'begin-button') as HTMLButtonElement | null,
    pause: find('pause', 'pauseBtn', 'pause-button') as HTMLButtonElement | null, sound: find('sound', 'soundBtn', 'sound-toggle'),
    volume: find('volume', 'volumeSlider', 'volume-slider') as HTMLInputElement | null, share: find('share', 'shareBtn', 'share-button'),
    seed: find('seedLabel', 'seed', 'seedValue', 'seed-label'), aboutToggle: find('about-toggle', 'aboutBtn', 'about-button'),
    about: find('about', 'about-panel', 'aboutPanel'), aboutClose: find('about-close', 'closeAbout', 'aboutClose'),
    controls: find('controls', 'hud'), status: find('status', 'announcement', 'live-status'), toast: find('toast'),
  };
  const controller = new AbortController(), signal = controller.signal;
  let idleTimer: ReturnType<typeof setTimeout> | undefined, statusTimer: ReturnType<typeof setTimeout> | undefined, begun = false, ready = false, aboutOpen = false;
  const listen = (element: EventTarget | null | undefined, type: string, handler: EventListenerOrEventListenerObject, options: AddEventListenerOptions = {}) =>
    element?.addEventListener(type, handler, { ...options, signal });
  const wake = () => {
    document.body.classList.remove('is-idle'); elements.controls?.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (begun && !elements.controls?.contains(document.activeElement) && !aboutOpen) {
        document.body.classList.add('is-idle'); elements.controls?.classList.add('is-idle');
      }
    }, (timings.idleDimSeconds ?? 4) * 1000);
  };
  const announce = (message: string) => {
    if (!elements.status) return;
    elements.status.textContent = message;
    if (elements.toast) { elements.toast.textContent = message; elements.toast.classList.add('show'); }
    clearTimeout(statusTimer); statusTimer = setTimeout(() => { elements.status!.textContent = ''; elements.toast?.classList.remove('show'); }, (timings.copiedToastSeconds ?? 2.2) * 1000);
  };
  const setAbout = (open: boolean) => {
    if (!elements.about) return;
    aboutOpen = open; (elements.about as HTMLElement & { inert: boolean }).inert = !open;
    elements.about.classList.toggle('open', open);
    elements.aboutToggle?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('about-open', open);
    if (open) (elements.aboutClose ?? elements.about).focus();
    else elements.aboutToggle?.focus();
    wake();
  };
  listen(elements.begin, 'click', actions.begin);
  listen(elements.pause, 'click', actions.pause);
  listen(elements.sound, 'click', actions.sound);
  listen(elements.volume, 'input', () => {
    const max = Number(elements.volume!.max) || 1;
    actions.volume(Number(elements.volume!.value) / max);
  });
  listen(elements.share, 'click', async (event) => {
    (event as Event).preventDefault();
    const url = actions.share();
    try { await navigator.clipboard.writeText(url); announce('link copied'); }
    catch { announce(`Share this universe: ${url}`); }
  });
  listen(elements.aboutToggle, 'click', () => setAbout(!aboutOpen));
  listen(elements.aboutClose, 'click', () => setAbout(false));
  listen(elements.canvas, 'pointerdown', () => { if (aboutOpen) setAbout(false); });
  listen(document, 'keydown', (event) => {
    const e = event as KeyboardEvent;
    if (e.key === 'Escape' && aboutOpen) setAbout(false);
    if (e.key === 'Tab' && aboutOpen && elements.about!.getAttribute('aria-modal') === 'true') {
      const focusable = [...elements.about!.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]')];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  for (const type of ['pointermove', 'pointerdown', 'focusin', 'keydown']) listen(document, type, wake, { passive: true });
  return {
    elements, wake, announce,
    ready() {
      if (ready) return;
      ready = true;
      elements.veil?.classList.add('gone'); elements.gate?.classList.add('ready');
      if (elements.begin) elements.begin.disabled = false;
    },
    begin() {
      begun = true;
      elements.gate?.classList.add('gone');
      if (elements.gate) (elements.gate as HTMLElement & { inert: boolean }).inert = true;
      if (elements.controls) (elements.controls as HTMLElement & { inert: boolean }).inert = false;
      if (elements.canvas) (elements.canvas as HTMLElement & { inert: boolean }).inert = false;
      if (elements.pause) elements.pause.disabled = false;
      document.body.classList.add('has-begun'); document.body.dataset.started = 'true';
      elements.canvas?.focus({ preventScroll: true }); wake();
    },
    sync({ paused, sound, volume, seed }) {
      document.body.classList.toggle('is-paused', paused); document.body.dataset.paused = String(paused);
      if (elements.pause) {
        elements.pause.setAttribute('aria-pressed', String(paused));
        elements.pause.setAttribute('aria-label', 'Pause');
        elements.pause.title = paused ? 'Resume (space)' : 'Pause (space)';
        elements.pause.dataset.paused = String(paused);
        const label = elements.pause.querySelector('[data-label], .label, .control-label');
        if (label) label.textContent = paused ? 'Resume' : 'Pause';
        else if (!elements.pause.querySelector('svg')) elements.pause.textContent = paused ? 'Resume' : 'Pause';
      }
      if (elements.sound) { elements.sound.setAttribute('aria-pressed', String(sound)); elements.sound.setAttribute('aria-label', 'Sound'); }
      if (elements.volume) elements.volume.value = String(volume * (Number(elements.volume.max) || 1));
      if (elements.seed) elements.seed.textContent = String(seed);
      if (elements.share && 'href' in elements.share && elements.share.tagName === 'A') (elements.share as HTMLAnchorElement).href = actions.share();
    },
    error(message: string) {
      announce(message);
      elements.veil?.classList.add('failed');
      const veilText = find('veilText'), retry = find('veilRetry');
      if (veilText) veilText.textContent = message;
      if (retry) retry.hidden = false;
      if (elements.begin) { elements.begin.disabled = true; elements.begin.textContent = message; }
    },
    dispose() { clearTimeout(idleTimer); clearTimeout(statusTimer); controller.abort(); },
  };
}
