import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirage Control Plane · Legacy → Cloud",
  description:
    "Enterprise control plane for legacy data estate discovery, disposition, SID mapping, and source-aligned data products",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
