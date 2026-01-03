import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import "./gradients.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "./ReactQueryProvider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin"
import { extractRouterConfig } from "uploadthing/server";
import { fileRouter } from "./api/uploadthing/core";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

const emojiFont = localFont({
  src: "./fonts/Emoji.ttf",
  variable: "--font-emoji",
  preload: true,
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: "%s - OchoApp",
    default: "OchoApp"
  },
  description: "The social media app for power nerd", // TODO: Translate this
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning={true}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${emojiFont.variable}`}>
        <Toaster/>
        <NextSSRPlugin routerConfig={extractRouterConfig(fileRouter)}/>
        <ReactQueryProvider>
          <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          >
            {children}
          </ThemeProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
