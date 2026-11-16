// GET /api/whereami: a coarse, city level location guess from the headers the
// Vercel edge adds to every request. No third party service is called and
// nothing is stored. Returns {} when the headers are absent (local dev, other hosts).

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function decode(v) {
  if (!v) return "";
  try { return decodeURIComponent(v); } catch { return String(v); }
}

export function GET(req) {
  const h = req.headers;
  const lat = parseFloat(h.get("x-vercel-ip-latitude") || "");
  const lon = parseFloat(h.get("x-vercel-ip-longitude") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(200, {});
  return json(200, {
    lat, lon,
    city: decode(h.get("x-vercel-ip-city")),
    country: decode(h.get("x-vercel-ip-country")),
    region: decode(h.get("x-vercel-ip-country-region")),
  });
}
