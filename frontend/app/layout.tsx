import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CompanyIntel Letter Builder",
  description: "企業調査と提案文下書き生成"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
