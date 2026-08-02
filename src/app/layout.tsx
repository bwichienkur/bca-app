import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tableside | Palm Beach County BCA Pool League",
  description:
    "Premium companion for FargoRate LMS league standings, schedules, handicaps, and match scoring.",
  applicationName: "Tableside",
  appleWebApp: {
    capable: true,
    title: "Tableside",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0D12",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSans.className} antialiased`}
        style={
          {
            "--font-body": "var(--font-geist-sans)",
            "--font-display": "var(--font-geist-sans)",
          } as CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
