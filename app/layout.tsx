import { Baloo_2 } from "next/font/google";
import "./globals.css";
// Baloo is Safal's display voice, used only for big headings and the pickup code.
// Everything people read and tap uses the system font, which already has optical sizes and Devanagari.
const head = Baloo_2({ subsets: ["latin", "devanagari"], weight: ["600", "700", "800"], variable: "--head" });
export const metadata = { title: "Campus Order", description: "Order ahead from Safal at NSUT" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved appearance (Light, Dark or System) before anything is drawn, so there's no flash of
// the wrong colours. In System mode it follows the device as it changes. components/ThemeSwitch.tsx calls
// window.__applyTheme after saving a new choice. It also keeps the browser bar colour in step.
const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");
function apply(){var c;try{c=localStorage.getItem("theme")}catch(e){}var t=c==="light"||c==="dark"?c:(m.matches?"dark":"light");
d.dataset.theme=t;var b=document.querySelector('meta[name="theme-color"]');if(!b){b=document.createElement("meta");b.name="theme-color";document.head.appendChild(b)}
b.content=t==="dark"?"#1e3a8a":"#1f6feb"}apply();m.addEventListener("change",apply);window.__applyTheme=apply})()`;

export default function Layout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the theme script sets data-theme on <html> before React loads.
  return <html lang="en" className={head.variable} suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
    <body>{children}</body></html>;
}
