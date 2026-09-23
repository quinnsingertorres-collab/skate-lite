import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "Skate Lite",
  description: "Unofficial route ladders for MBTA buses, built on public MBTA data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
