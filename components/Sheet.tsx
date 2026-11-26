"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";

// A sheet that behaves like a physical object: it follows the finger 1:1, keeps the flick's speed
// when let go, and can be caught and reversed mid-animation. Motion is driven by one value, p:
// 0 is closed, 1 is open. Springs use Apple's two parameters, response (seconds) and damping ratio.

export type SheetHandle = { open(): void; close(): void };
type Props = { label: string; children: ReactNode; ref?: Ref<SheetHandle> };

const MOBILE = "(max-width: 639px)", REDUCED = "(prefers-reduced-motion: reduce)";
const matches = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
// Where a flick would come to rest, using the same deceleration as scrolling.
const project = (velocity: number, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);
// Past the edge the sheet follows less and less, like something being stretched.
const rubberband = (over: number, size: number, c = 0.55) => (over * size * c) / (size + c * Math.abs(over));

export default function Sheet({ label, children, ref }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), panel = useRef<HTMLDivElement>(null), scrim = useRef<HTMLDivElement>(null);
  const s = useRef({ p: 0, v: 0, target: 0, response: 0.34, damping: 1, frame: 0, last: 0, height: 1 });
  const drag = useRef<{ id: number; startY: number; startP: number; moved: boolean; history: { t: number; y: number }[] } | null>(null);

  // Draws p. On a phone the sheet rises from the bottom; in a wider window it grows in place.
  const render = useCallback(() => {
    const { p, height } = s.current, el = panel.current, bg = scrim.current;
    if (!el || !bg) return;
    bg.style.opacity = String(clamp(p));
    if (matches(REDUCED)) { el.style.transform = "none"; el.style.opacity = String(clamp(p)); return; }
    if (matches(MOBILE)) { el.style.opacity = "1"; el.style.transform = `translate3d(0, ${(1 - p) * height}px, 0)`; }
    else { el.style.opacity = String(clamp(p)); el.style.transform = `translate3d(0, ${(1 - p) * 24}px, 0) scale(${0.96 + 0.04 * clamp(p)})`; }
  }, []);

  const tick = useCallback((now: number) => {
    const st = s.current, dt = Math.min(0.064, (now - st.last) / 1000 || 1 / 60);
    st.last = now;
    // Mass 1 spring: stiffness and damping come from response and damping ratio. Small steps keep it stable.
    const k = (2 * Math.PI / st.response) ** 2, c = (4 * Math.PI * st.damping) / st.response, steps = Math.ceil(dt * 240);
    for (let i = 0; i < steps; i++) { st.v += (-k * (st.p - st.target) - c * st.v) * (dt / steps); st.p += st.v * (dt / steps); }
    if (Math.abs(st.p - st.target) < 0.0005 && Math.abs(st.v) < 0.005) {
      st.p = st.target; st.v = 0; st.frame = 0; render();
      if (st.target === 0) dialog.current?.close();
      return;
    }
    render();
    st.frame = requestAnimationFrame(tick);
  }, [render]);

  // Retargets from wherever the sheet is now, keeping its velocity, so a reversal never jumps.
  const go = useCallback((target: 0 | 1, velocity?: number, damping = 1) => {
    const st = s.current;
    st.target = target; st.damping = damping; st.response = matches(REDUCED) ? 0.2 : 0.34;
    if (velocity !== undefined) st.v = velocity;
    if (!st.frame) { st.last = performance.now(); st.frame = requestAnimationFrame(tick); }
  }, [tick]);

  const measure = () => { if (panel.current) s.current.height = panel.current.offsetHeight; };
  const open = useCallback(() => {
    const d = dialog.current;
    if (!d) return;
    // Focus the sheet itself, not its first button, so Enter can't remove an item by accident.
    if (!d.open) { s.current.p = 0; s.current.v = 0; d.showModal(); panel.current?.focus({ preventScroll: true }); measure(); render(); }
    go(1);
  }, [go, render]);
  const close = useCallback(() => { if (dialog.current?.open) go(0); }, [go]);
  useImperativeHandle(ref, () => ({ open, close }), [open, close]);
  useEffect(() => () => cancelAnimationFrame(s.current.frame), []);

  // Dragging the top of the sheet: 1:1 with the finger, from wherever it was grabbed.
  const down = (e: React.PointerEvent) => {
    if (!matches(MOBILE) || e.button !== 0) return;
    measure();
    cancelAnimationFrame(s.current.frame); s.current.frame = 0;
    drag.current = { id: e.pointerId, startY: e.clientY, startP: s.current.p, moved: false, history: [{ t: e.timeStamp, y: e.clientY }] };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone; tracking still works while it's over the grabber */ }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const st = s.current, dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    const raw = d.startP - dy / st.height;
    st.p = raw > 1 ? 1 + rubberband((raw - 1) * st.height, st.height) / st.height : raw;
    d.history = [...d.history.filter((h) => e.timeStamp - h.t < 100), { t: e.timeStamp, y: e.clientY }];
    render();
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const st = s.current, first = d.history[0], last = d.history.at(-1)!;
    const vy = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0; // px per second, down is positive
    // Decide from where the flick is heading, not where the finger let go.
    const restingP = st.p - project(vy) / st.height, velocity = -vy / st.height;
    if (!d.moved) { go(st.target === 0 ? 0 : 1); return; }
    if (restingP < 0.5) go(0, velocity);
    else go(1, velocity, Math.abs(vy) > 300 ? 0.82 : 1); // a little bounce only when it was thrown back
  };

  return <dialog ref={dialog} className="sheet-host" aria-label={label}
    onCancel={(e) => { e.preventDefault(); close(); }}>
    <div ref={scrim} className="scrim" onClick={close} />
    <div ref={panel} className="sheet" tabIndex={-1}>
      <div className="grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden><span /></div>
      <div className="sheet-body">{children}</div>
    </div>
  </dialog>;
}
