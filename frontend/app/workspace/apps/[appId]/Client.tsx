"use client";

import { useParams } from "next/navigation";
import { StandaloneAppShell } from "@/components/workspace/StandaloneAppShell";

export default function StandaloneAppPage() {
  const params = useParams();
  const appId = String(params.appId || "");
  return <StandaloneAppShell appId={appId} />;
}
