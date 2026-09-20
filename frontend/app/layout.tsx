import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirage Suite · Legacy estates → governed data products",
  description:
    "AI-powered control plane for brownfield transformation — discover, decide, deliver, and retire with human-in-the-loop governance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
