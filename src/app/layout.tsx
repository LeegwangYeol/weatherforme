import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://weatherforme.vercel.app"),
  title: "WeatherForMe",
  description: "비 오기 전에 미리 알려주는 내 위치 기반 우산 알리미",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WeatherForMe",
  },
  openGraph: {
    title: "WeatherForMe",
    description: "비 오기 전에 미리 알려주는 내 위치 기반 우산 알리미",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "WeatherForMe" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WeatherForMe",
    description: "비 오기 전에 미리 알려주는 내 위치 기반 우산 알리미",
    images: ["/og-image.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#9ecdf9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#c9e4fd]">{children}</body>
    </html>
  );
}
