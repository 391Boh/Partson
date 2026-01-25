import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import ClientWrapper from "./client-wrapper";
import LayoutHost from "./components/LayoutHost";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="uk">
      <head>
        <title>PartsON - Магазин автозапчастин</title>
        <link rel="shortcut icon" href="/Car-parts-fullwidth.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ClientWrapper>
          <LayoutHost>{children}</LayoutHost>
        </ClientWrapper>
      </body>
    </html>
  );
}
