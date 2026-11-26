"use client";
import { useEffect, useRef, useState } from "react";

// Light, Dark or System (follow the device). Saved per device; the script in app/layout.tsx applies it.
type Mode = "light" | "dark" | "system";
const ICONS: Record<Mode, React.ReactNode> = {
  light: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  dark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>,
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
};
const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const MODES: Mode[] = ["light", "dark", "system"];
const NAMES: Record<Mode, string> = { light: "Light", dark: "Dark", system: "System" };

/** The saved appearance and a way to change it. */
function useThemeMode(): [Mode, (m: Mode) => void, () => void] {
  const [mode, setMode] = useState<Mode>("system");
  // Reads the saved choice: on load, when another tab changes it, and when the menu opens.
  const sync = () => { const saved = localStorage.getItem("theme"); setMode(saved === "light" || saved === "dark" ? saved : "system"); };
  useEffect(() => {
    sync();
    const other = (e: StorageEvent) => { if (e.key === "theme") { sync(); (window as unknown as { __applyTheme?: () => void }).__applyTheme?.(); } };
    addEventListener("storage", other);
    return () => removeEventListener("storage", other);
  }, []);
  const choose = (m: Mode) => {
    setMode(m);
    if (m === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", m);
    (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
  };
  return [mode, choose, sync];
}

/** All three choices side by side. Used where there's room: sign-in and the Safal dashboard. */
export default function ThemeSwitch({ t = (s: string) => s }: { t?: (s: string) => string }) {
  const [mode, choose] = useThemeMode();
  return <div className="theme-switch" role="radiogroup" aria-label={t("Appearance")}>
    {MODES.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => choose(m)}>{ICONS[m]}<span>{t(NAMES[m])}</span></button>)}
  </div>;
}

/** A single button showing the current mode, opening a small menu. Fits in the student top bar on every page. */
export function ThemeMenu() {
  const [mode, choose, sync] = useThemeMode();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); } };
    addEventListener("pointerdown", outside); addEventListener("keydown", escape);
    return () => { removeEventListener("pointerdown", outside); removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="theme-menu" ref={box}>
    <button type="button" className="theme-btn" aria-label={`Appearance: ${NAMES[mode]}`} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { if (!open) sync(); setOpen(!open); }}>{ICONS[mode]}</button>
    {open && <div className="theme-pop" role="menu" aria-label="Appearance">
      {MODES.map((m) => <button key={m} type="button" role="menuitemradio" aria-checked={mode === m}
        onClick={() => { choose(m); setOpen(false); }}>{ICONS[m]}<span>{NAMES[m]}</span>{mode === m && CHECK}</button>)}
    </div>}
  </div>;
}
