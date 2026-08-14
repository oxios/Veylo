import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./qa.css";
import "./advanced.css";
import "./system.css";
import "./qa-system.css";
import "./business.css";
import "./audit.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
export const metadata: Metadata = { title: "VenueFlow Video Analytics", description: "Операционная видеоаналитика для кафе и ресторанов", other: { "codex-preview": "development" } };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body className={manrope.variable}>{children}</body></html>}
