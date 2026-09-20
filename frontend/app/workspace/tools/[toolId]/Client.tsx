"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTool, toolHref } from "@/lib/phases";

export default function ToolHubPage() {
  const params = useParams();
  const router = useRouter();
  const toolId = String(params.toolId || "");
  const tool = getTool(toolId);

  useEffect(() => {
    if (!tool) {
      router.replace("/workspace/gallery");
      return;
    }
    // Suite journey starts at Discover — skip Mobilize
    if (tool.id === "mobilize") {
      router.replace(toolHref("atlas"));
      return;
    }
    // Always open on step 1 (first segment) for every tool.
    router.replace(toolHref(tool.id));
  }, [tool, router]);

  if (!tool) {
    return <div className="p-5 text-sm text-bad">Unknown tool: {toolId}</div>;
  }

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-brand-muted">
      Opening {tool.productName}…
    </div>
  );
}
