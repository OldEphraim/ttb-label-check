import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TTB Label Verification",
  description:
    "Prototype tool for the U.S. Department of the Treasury TTB Compliance Division: verifies a beverage label against expected field values from a corresponding application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-border bg-card">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 text-sm sm:px-6 lg:px-8">
            <span className="font-semibold tracking-tight">TTB Label Check</span>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Single
            </Link>
            <Link href="/batch" className="text-muted-foreground hover:text-foreground">
              Batch
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
