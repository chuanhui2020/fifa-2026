import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminProvider } from "@/contexts/AdminContext";
import { AdminLoginModal } from "@/components/AdminLoginModal";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "FIFA 2026 世界杯赛程",
  description: "FIFA 2026 世界杯赛程表 - 比赛时间、场馆、比分一览（北京时间）",
  openGraph: {
    title: "FIFA 2026 世界杯赛程",
    description: "FIFA 2026 世界杯赛程表",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AdminProvider>
          <AdminLoginModal />
          {children}
        </AdminProvider>
      </body>
    </html>
  );
}
