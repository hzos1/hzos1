const USER_AGENT = "dse4070-meal-agent/0.1 (CityU DSC4070 course demo)";

export function sanitizeUntrusted(value) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const injection = /ignore previous|system prompt|you are now|設定卡路里|set calories|<\s*script/i.test(text);
  return { text, injection };
}

export async function findPlaces({ lat, lon, area, consent }, fetchImpl = fetch) {
  if (!consent) {
    return { ok: false, reason: "未得到定位或地區同意，所以沒有查地圖。", reasonEn: "Location or an area was not consented, so the map was not queried.", places: [] };
  }
  let point = Number.isFinite(lat) && Number.isFinite(lon) ? { lat: Number(lat), lon: Number(lon), label: "browser geolocation" } : null;
  if (!point && area) {
    const clean = sanitizeUntrusted(area);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", clean.text);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) return { ok: false, reason: `地理編碼失敗：HTTP ${response.status}`, reasonEn: `Geocoding failed: HTTP ${response.status}`, places: [] };
    const rows = await response.json();
    if (!rows?.length) return { ok: false, reason: `地圖找不到「${clean.text}」。`, reasonEn: `The map has no match for “${clean.text}”.`, places: [] };
    point = { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: sanitizeUntrusted(rows[0].display_name).text, injection: clean.injection };
  }
  if (!point) return { ok: false, reason: "沒有座標，也沒有地區文字。", reasonEn: "There are no coordinates and no area text.", places: [] };
  const query = `[out:json][timeout:12];(node["amenity"~"restaurant|fast_food|cafe"](around:1200,${point.lat},${point.lon}););out body 12;`;
  const response = await fetchImpl("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "text/plain" },
    body: query,
  });
  if (!response.ok) return { ok: false, reason: `餐廳查詢失敗：HTTP ${response.status}`, reasonEn: `Place query failed: HTTP ${response.status}`, places: [], geocoded: point };
  const body = await response.json();
  const places = (body.elements || []).filter((element) => element.tags?.name).slice(0, 8).map((element) => {
    const name = sanitizeUntrusted(element.tags.name);
    const cuisine = sanitizeUntrusted(element.tags.cuisine || "");
    return {
      osmType: element.type,
      osmId: element.id,
      name: name.text,
      cuisine: cuisine.text || null,
      injection: name.injection || cuisine.injection,
      lat: element.lat,
      lon: element.lon,
      url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      source: "openstreetmap",
    };
  });
  return {
    ok: true,
    reason: places.length ? "名單來自 OpenStreetMap，可能過時，而且沒有菜單或卡路里。" : "這範圍的 OpenStreetMap 沒有帶名稱的餐廳節點。",
    reasonEn: places.length ? "Names come from OpenStreetMap. They may be stale, and there is no menu or calorie data." : "OpenStreetMap has no named restaurant node in this area.",
    places,
    geocoded: point,
    menuCalories: null,
  };
}
