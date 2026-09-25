export default function manifest() {
  return {
    name: "skate lite",
    short_name: "skate",
    description: "Route ladders for MBTA buses, built on public MBTA data.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
