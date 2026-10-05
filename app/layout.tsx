import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rain-Day Cover",
  description: "If rain stops your work, you're paid in PayPal the same day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-2xl items-center px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">☔ Rain-Day Cover</Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-muted">
          Prototype for the PayPal AI Hackathon. PayPal sandbox only, no real money. Not a regulated insurance product.
        </footer>
      </body>
    </html>
  );
}
