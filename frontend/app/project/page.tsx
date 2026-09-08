"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Compatibility: old /project SPA redirects into the workspace shell. */
export default function ProjectRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/workspace");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-brand-muted">
      Redirecting to workspace…
    </div>
  );
}
