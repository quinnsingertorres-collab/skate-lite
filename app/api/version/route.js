// Which deploy is live (compared by open pages to reload themselves after an update).
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD || "" }, { headers: { "Cache-Control": "no-store" } });
}
