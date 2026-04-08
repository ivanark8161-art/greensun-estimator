// ─── Geocoding & Drive Time ───────────────────────────────────────────────────
// Uses OpenStreetMap Nominatim (free, no API key required)

interface Coords { lat: number; lon: number }

const cache = new Map<string, Coords | null>();

export async function geocode(address: string): Promise<Coords | null> {
  const key = address.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) { cache.set(key, null); return null; }
    const coords: Coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache.set(key, coords);
    return coords;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Haversine distance in miles */
export function distanceMiles(a: Coords, b: Coords): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLon * sinLon;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Drive time in fractional hours, given average speed mph */
export function driveTimeHours(fromAddr: string | null, toAddr: string | null, speedMph: number): Promise<number> {
  if (!fromAddr || !toAddr) return Promise.resolve(0.5); // fallback 30 min
  return Promise.all([geocode(fromAddr), geocode(toAddr)]).then(([a, b]) => {
    if (!a || !b) return 0.5;
    const miles = distanceMiles(a, b);
    return miles / speedMph;
  });
}
