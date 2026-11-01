import type { Metadata, Viewport } from "next";
import "@fontsource/lalezar/400.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "رحلة العميل | Customer Journey",
  description: "حوّل متجرك الإلكتروني إلى عالم تسوّق ثلاثي الأبعاد يتجوّل فيه العميل بمنظور الشخص الأول.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#2A2335" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
