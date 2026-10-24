export function bindInput(canvas, { orbit, steer, zoom, pause, wake, change = () => {}, active = () => true }) {
  const controller = new AbortController(), signal = controller.signal;
  const pointers = new Map(), keys = new Set();
  let pinch = 0;
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal });
  const gap = () => {
    const list = [...pointers.values()];
    return list.length === 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0;
  };
  listen(canvas, 'contextmenu', (event) => event.preventDefault());
  listen(canvas, 'pointerdown', (event) => {
    wake();
    if (!active()) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', button: event.button });
    pinch = gap();
  });
  listen(canvas, 'pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    previous.x = event.clientX; previous.y = event.clientY;
    if (pointers.size > 1) {
      const nextGap = gap();
      if (pinch > 0 && nextGap > 0) zoom(Math.log(pinch / nextGap));
      pinch = nextGap;
    } else if (previous.touch || previous.button === 2 || event.shiftKey) steer(dx * 0.003, -dy * 0.002);
    else orbit(dx, dy);
    wake(); change();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, (event) => {
    pointers.delete(event.pointerId); pinch = gap();
  });
  listen(canvas, 'wheel', (event) => {
    if (!active()) return;
    event.preventDefault(); zoom(Math.max(-0.4, Math.min(0.4, event.deltaY * (event.deltaMode === 1 ? 0.015 : 0.001)))); wake(); change();
  }, { passive: false });
  listen(window, 'keydown', (event) => {
    if (event.target.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (event.code === 'Space' && !event.repeat && active()) { event.preventDefault(); pause(); }
    if (event.code.startsWith('Arrow') && active()) { event.preventDefault(); keys.add(event.code); wake(); }
  });
  listen(window, 'keyup', (event) => keys.delete(event.code));
  listen(window, 'blur', () => { keys.clear(); pointers.clear(); pinch = 0; });
  return {
    update(dt) {
      const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      const y = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
      if (x || y) { steer(x * dt * 0.28, y * dt * 0.18); change(); }
    },
    dispose() { controller.abort(); },
  };
}
