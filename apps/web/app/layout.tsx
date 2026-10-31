import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Clipper — Smart Auto-Clipping",
  description: "Turn long videos into ready-to-post clips with captions, face tracking, and local rendering.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-grid-fade bg-grid opacity-60" />
        <div className="pointer-events-none fixed left-1/2 top-[-240px] -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-lime/10 blur-[140px]" />
        <AppHeader />
        <main className="relative mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
