import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
export const metadata: Metadata = { title: "VenueFlow", description: "Особистий кабінет VenueFlow", other: { "codex-preview": "development" } };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="uk"><body className={manrope.variable}>{children}</body></html>}
