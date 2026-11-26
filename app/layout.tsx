import { Baloo_2 } from "next/font/google";
import "./globals.css";
// Baloo is Safal's display voice, used only for big headings and the pickup code.
// Everything people read and tap uses the system font, which already has optical sizes and Devanagari.
const head = Baloo_2({ subsets: ["latin", "devanagari"], weight: ["600", "700", "800"], variable: "--head" });
export const metadata = { title: "Campus Order", description: "Order ahead from Safal at NSUT" };
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1f6feb" }, { media: "(prefers-color-scheme: dark)", color: "#1e3a8a" }],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={head.variable}><body>{children}</body></html>;
}
