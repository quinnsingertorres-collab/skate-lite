export default function manifest() {
  return {
    name: "sk8 lite",
    short_name: "sk8",
    description: "Route ladders for MBTA buses, built on public MBTA data.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
