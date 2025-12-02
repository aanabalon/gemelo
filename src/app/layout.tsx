import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { startDerivedValuePoller } from "@/lib/jobs/derivedValuePoller";
import { startCycleProcessingPoller } from "@/lib/jobs/cycleProcessingPoller";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gemelo APP INGERO",
  description: "Sistema de Ciclos de Congelado",
};

if (typeof window === "undefined") {
  startDerivedValuePoller();
  startCycleProcessingPoller();
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
