"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HardDrive, Settings2, Sparkles } from "lucide-react";
import SettingsDrawer from "@/components/SettingsDrawer";
import { api, type StorageOverview } from "@/lib/api";

export default function AppHeader() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storage, setStorage] = useState<StorageOverview | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      api<StorageOverview>("/api/storage")
        .then((data) => {
          if (active) setStorage(data);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname]);

  const nav = [
    { href: "/", label: "Import" },
    { href: "/channels", label: "Channels" },
    { href: "/storage", label: "Storage" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-lime text-black shadow-lime">
                <Sparkles size={17} strokeWidth={2.6} />
              </span>
              <span className="text-lg font-black tracking-tight text-white">
                CLIP<span className="text-lime">PER</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              {nav.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/storage"
              className="hidden items-center gap-2 rounded-lg border border-white/10 bg-panel px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-white md:flex"
            >
              <HardDrive size={14} />
              <span>{storage ? `${storage.data_size_label} used` : "Storage"}</span>
              {storage?.warning ? <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> : null}
            </Link>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-lime/25 bg-lime/10 px-3 py-1.5 text-xs font-medium text-lime hover:bg-lime/15"
            >
              <Settings2 size={14} />
              <span className="hidden sm:inline">LLM Settings</span>
            </button>
          </div>
        </div>
      </header>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
