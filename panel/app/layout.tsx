import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T.Group • GC + Finance Panel",
  description: "Painel interno para GC e Finance do T.Group",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
