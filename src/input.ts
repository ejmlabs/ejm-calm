export type InputHandlers = {
  orbit: (dx: number, dy: number) => void;
  steer: (yaw: number, pitch: number) => void;
  zoom: (amount: number) => void;
  pause: () => void;
  wake: () => void;
  change?: () => void;
  active?: () => boolean;
};

export type BoundInput = {
  update(dt: number): void;
  dispose(): void;
};

type PointerState = { x: number; y: number; touch: boolean; button: number };

export function bindInput(canvas: HTMLElement, { orbit, steer, zoom, pause, wake, change = () => {}, active = () => true }: InputHandlers): BoundInput {
  const controller = new AbortController(), signal = controller.signal;
  const pointers = new Map<number, PointerState>(), keys = new Set<string>();
  let pinch = 0;
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window | Document, type: K | string, handler: EventListenerOrEventListenerObject, options: AddEventListenerOptions = {}) =>
    target.addEventListener(type, handler, { ...options, signal });
  const gap = (): number => {
    const list = [...pointers.values()];
    return list.length === 2 ? Math.hypot(list[0]!.x - list[1]!.x, list[0]!.y - list[1]!.y) : 0;
  };
  listen(canvas, 'contextmenu', (event) => (event as Event).preventDefault());
  listen(canvas, 'pointerdown', (event) => {
    const e = event as PointerEvent;
    wake();
    if (!active()) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', button: e.button });
    pinch = gap();
  });
  listen(canvas, 'pointermove', (event) => {
    const e = event as PointerEvent;
    const previous = pointers.get(e.pointerId);
    if (!previous) return;
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    previous.x = e.clientX; previous.y = e.clientY;
    if (pointers.size > 1) {
      const nextGap = gap();
      if (pinch > 0 && nextGap > 0) zoom(Math.log(pinch / nextGap));
      pinch = nextGap;
    } else if (previous.touch || previous.button === 2 || e.shiftKey) steer(dx * 0.003, -dy * 0.002);
    else orbit(dx, dy);
    wake(); change();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, (event) => {
    pointers.delete((event as PointerEvent).pointerId); pinch = gap();
  });
  listen(canvas, 'wheel', (event) => {
    const e = event as WheelEvent;
    if (!active()) return;
    e.preventDefault(); zoom(Math.max(-0.4, Math.min(0.4, e.deltaY * (e.deltaMode === 1 ? 0.015 : 0.001)))); wake(); change();
  }, { passive: false });
  listen(window, 'keydown', (event) => {
    const e = event as KeyboardEvent;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (e.code === 'Space' && !e.repeat && active()) { e.preventDefault(); pause(); }
    if (e.code.startsWith('Arrow') && active()) { e.preventDefault(); keys.add(e.code); wake(); }
  });
  listen(window, 'keyup', (event) => keys.delete((event as KeyboardEvent).code));
  listen(window, 'blur', () => { keys.clear(); pointers.clear(); pinch = 0; });
  return {
    update(dt: number) {
      const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      const y = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
      if (x || y) { steer(x * dt * 0.28, y * dt * 0.18); change(); }
    },
    dispose() { controller.abort(); },
  };
}
