"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { startDemoSession, DEMO_MODE } from "@/lib/api";

/**
 * One-click demo entry — seeds architect session and opens the workspace.
 * Only meaningful when NEXT_PUBLIC_DEMO_MODE=1 (GitHub Pages build).
 */
export default function DemoLaunchPage() {
  const router = useRouter();

  useEffect(() => {
    startDemoSession();
    router.replace("/workspace");
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1220] px-6 text-center text-white">
      <div className="brand-mark mb-4 !h-12 !w-12 !text-lg">M</div>
      <p className="text-sm font-medium tracking-wide text-white/70">
        {DEMO_MODE ? "Launching Mirage Suite demo…" : "Opening workspace…"}
      </p>
      <p className="mt-2 max-w-sm text-xs text-white/45">
        Mock control plane with fixture-backed estates. No backend required.
      </p>
    </div>
  );
}
