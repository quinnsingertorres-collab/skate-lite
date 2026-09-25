import "leaflet/dist/leaflet.css";
import "./globals.css";
import ThemeClock from "@/components/ThemeClock";
import { THEME_SCRIPT } from "@/lib/sunTheme";

export const metadata = {
  title: "skate lite",
  description: "Unofficial route ladders for MBTA buses, built on public MBTA data.",
  appleWebApp: { capable: true, title: "skate", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fafafa", // ThemeClock swaps this after sunset
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Picks light/dark before first paint so there is no flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeClock />
        {children}
      </body>
    </html>
  );
}
