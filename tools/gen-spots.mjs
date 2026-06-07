// Generates additional California surf spots and APPENDS them to js/spots.js.
// Each new coordinate is validated against the Open-Meteo Marine API; any that
// return no wave data (inland / bad coord) are dropped and reported.
// Run: node tools/gen-spots.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPOTS_FILE = path.join(root, "js/spots.js");

// [name, region, lat, lon, type, level, facing]  (north → south)
const NEW = [
  // ---- Del Norte / Humboldt ----
  ["South Beach", "Crescent City, CA", 41.739, -124.201, "beach", "intermediate", 250],
  ["Point St. George", "Crescent City, CA", 41.789, -124.255, "reef", "advanced", 270],
  ["Wilson Creek", "Klamath, CA", 41.607, -124.103, "beach", "intermediate", 270],
  ["Moonstone Beach (Trinidad)", "Trinidad, CA", 41.021, -124.112, "beach", "intermediate", 265],
  ["Camel Rock", "Trinidad, CA", 41.071, -124.165, "beach", "intermediate", 270],
  ["Clam Beach", "McKinleyville, CA", 40.992, -124.111, "beach", "beginner", 270],
  ["Samoa Beach", "Samoa, CA", 40.788, -124.227, "beach", "advanced", 270],
  ["North Jetty", "Eureka, CA", 40.766, -124.235, "beach", "advanced", 270],
  ["Centerville Beach", "Ferndale, CA", 40.564, -124.353, "beach", "advanced", 265],
  ["Shelter Cove", "Shelter Cove, CA", 40.026, -124.073, "beach", "intermediate", 230],
  // ---- Mendocino ----
  ["Westport", "Westport, CA", 39.636, -123.783, "beach", "advanced", 270],
  ["Virgin Creek", "Fort Bragg, CA", 39.466, -123.802, "beach", "intermediate", 270],
  ["Pudding Creek", "Fort Bragg, CA", 39.458, -123.808, "beach", "intermediate", 270],
  ["Caspar Beach", "Caspar, CA", 39.362, -123.818, "beach", "intermediate", 265],
  ["Big River", "Mendocino, CA", 39.301, -123.793, "beach", "intermediate", 260],
  ["Arena Cove", "Point Arena, CA", 38.911, -123.711, "reef", "advanced", 250],
  ["Manchester State Beach", "Manchester, CA", 38.968, -123.692, "beach", "intermediate", 270],
  ["Gualala", "Gualala, CA", 38.768, -123.534, "beach", "intermediate", 260],
  // ---- Sonoma ----
  ["Salmon Creek", "Bodega Bay, CA", 38.352, -123.067, "beach", "intermediate", 270],
  ["Doran Beach", "Bodega Bay, CA", 38.309, -123.034, "beach", "beginner", 200],
  ["Dillon Beach", "Dillon Beach, CA", 38.251, -122.962, "beach", "intermediate", 260],
  // ---- Marin / SF ----
  ["Stinson Beach", "Stinson Beach, CA", 37.901, -122.642, "beach", "beginner", 250],
  ["Rodeo Beach", "Sausalito, CA", 37.832, -122.540, "beach", "intermediate", 250],
  ["Kelly's Cove", "San Francisco, CA", 37.778, -122.513, "beach", "advanced", 270],
  ["Fort Point", "San Francisco, CA", 37.810, -122.477, "reef", "advanced", 250],
  // ---- San Mateo / Half Moon Bay ----
  ["Rockaway Beach (Pacifica)", "Pacifica, CA", 37.610, -122.493, "beach", "intermediate", 270],
  ["Sharp Park", "Pacifica, CA", 37.632, -122.494, "beach", "intermediate", 270],
  ["Montara State Beach", "Montara, CA", 37.552, -122.514, "beach", "advanced", 270],
  ["Gray Whale Cove", "Montara, CA", 37.563, -122.518, "beach", "intermediate", 270],
  ["Pillar Point", "Half Moon Bay, CA", 37.496, -122.498, "reef", "advanced", 290],
  ["Surfer's Beach", "El Granada, CA", 37.502, -122.482, "beach", "beginner", 270],
  ["San Gregorio", "San Gregorio, CA", 37.323, -122.401, "beach", "intermediate", 260],
  ["Pescadero", "Pescadero, CA", 37.262, -122.413, "beach", "intermediate", 260],
  // ---- Santa Cruz County ----
  ["Waddell Creek", "Davenport, CA", 37.097, -122.277, "beach", "advanced", 250],
  ["Scott Creek", "Davenport, CA", 37.042, -122.234, "beach", "intermediate", 255],
  ["Davenport Landing", "Davenport, CA", 37.019, -122.213, "beach", "intermediate", 255],
  ["Four Mile", "Santa Cruz, CA", 36.985, -122.156, "point", "advanced", 220],
  ["Natural Bridges", "Santa Cruz, CA", 36.949, -122.058, "point", "intermediate", 215],
  ["Mitchell's Cove", "Santa Cruz, CA", 36.952, -122.044, "reef", "intermediate", 210],
  ["38th Avenue", "Santa Cruz, CA", 36.961, -121.972, "point", "intermediate", 200],
  ["Capitola", "Capitola, CA", 36.971, -121.951, "beach", "beginner", 195],
  ["Manresa", "La Selva Beach, CA", 36.934, -121.851, "beach", "intermediate", 200],
  ["Rio Del Mar", "Aptos, CA", 36.965, -121.901, "beach", "beginner", 200],
  // ---- Monterey / Big Sur ----
  ["Moss Landing", "Moss Landing, CA", 36.802, -121.789, "beach", "advanced", 270],
  ["Marina State Beach", "Marina, CA", 36.694, -121.808, "beach", "advanced", 270],
  ["Monastery Beach", "Carmel, CA", 36.522, -121.923, "beach", "advanced", 250],
  ["Andrew Molera", "Big Sur, CA", 36.285, -121.862, "beach", "advanced", 250],
  ["Willow Creek", "Big Sur, CA", 35.921, -121.474, "beach", "intermediate", 250],
  // ---- San Luis Obispo (North) ----
  ["San Simeon", "San Simeon, CA", 35.643, -121.189, "beach", "intermediate", 260],
  ["Pico Creek", "San Simeon, CA", 35.617, -121.140, "beach", "intermediate", 265],
  ["Studio Drive", "Cayucos, CA", 35.453, -120.909, "beach", "beginner", 285],
  ["Morro Strand", "Morro Bay, CA", 35.400, -120.868, "beach", "intermediate", 275],
  ["The Pit", "Morro Bay, CA", 35.370, -120.866, "beach", "advanced", 275],
  ["Oceano", "Oceano, CA", 35.099, -120.633, "beach", "beginner", 250],
  // ---- Santa Barbara County ----
  ["Ocean Beach Park", "Lompoc, CA", 34.690, -120.602, "beach", "intermediate", 255],
  ["Sands (Coal Oil Point)", "Goleta, CA", 34.406, -119.878, "point", "intermediate", 200],
  ["Devereux", "Goleta, CA", 34.412, -119.873, "reef", "intermediate", 195],
  ["Leadbetter", "Santa Barbara, CA", 34.404, -119.692, "point", "beginner", 200],
  ["Hammond's", "Montecito, CA", 34.420, -119.624, "reef", "intermediate", 195],
  ["Carpinteria State Beach", "Carpinteria, CA", 34.389, -119.519, "beach", "beginner", 200],
  // ---- Ventura County ----
  ["Mussel Shoals", "Ventura, CA", 34.359, -119.443, "point", "intermediate", 195],
  ["Hobson", "Ventura, CA", 34.357, -119.430, "reef", "intermediate", 195],
  ["Faria", "Ventura, CA", 34.334, -119.408, "reef", "intermediate", 195],
  ["Pitas Point", "Ventura, CA", 34.343, -119.443, "point", "intermediate", 200],
  ["Mondos", "Ventura, CA", 34.349, -119.441, "point", "beginner", 200],
  ["Pierpont", "Ventura, CA", 34.262, -119.292, "beach", "intermediate", 210],
  ["Ventura Harbor", "Ventura, CA", 34.244, -119.268, "beach", "intermediate", 215],
  ["Silver Strand", "Oxnard, CA", 34.169, -119.231, "beach", "intermediate", 230],
  ["Hollywood Beach", "Oxnard, CA", 34.162, -119.228, "beach", "beginner", 235],
  ["Mandalay", "Oxnard, CA", 34.199, -119.252, "beach", "intermediate", 245],
  ["Oxnard Shores", "Oxnard, CA", 34.192, -119.249, "beach", "intermediate", 245],
  // ---- Los Angeles County ----
  ["County Line", "Malibu, CA", 34.050, -118.963, "point", "intermediate", 210],
  ["Leo Carrillo", "Malibu, CA", 34.044, -118.936, "reef", "intermediate", 205],
  ["Nicholas Canyon", "Malibu, CA", 34.041, -118.927, "beach", "intermediate", 205],
  ["Point Dume", "Malibu, CA", 34.001, -118.806, "beach", "intermediate", 200],
  ["Latigo", "Malibu, CA", 34.038, -118.741, "point", "intermediate", 200],
  ["Sunset (Santa Monica)", "Pacific Palisades, CA", 34.039, -118.561, "point", "beginner", 200],
  ["Bay Street", "Santa Monica, CA", 34.009, -118.494, "beach", "intermediate", 230],
  ["Manhattan Beach", "Manhattan Beach, CA", 33.889, -118.418, "beach", "intermediate", 250],
  ["Hermosa Beach", "Hermosa Beach, CA", 33.862, -118.404, "beach", "intermediate", 250],
  ["Redondo Breakwater", "Redondo Beach, CA", 33.841, -118.394, "beach", "intermediate", 245],
  ["Torrance Beach", "Torrance, CA", 33.813, -118.391, "beach", "intermediate", 245],
  ["Haggerty's", "Palos Verdes, CA", 33.802, -118.392, "reef", "advanced", 230],
  ["Lunada Bay", "Palos Verdes, CA", 33.772, -118.425, "reef", "advanced", 290],
  ["Bluff Cove", "Palos Verdes, CA", 33.781, -118.412, "reef", "advanced", 270],
  // ---- Orange County ----
  ["Seal Beach", "Seal Beach, CA", 33.740, -118.104, "beach", "beginner", 215],
  ["River Jetties", "Newport Beach, CA", 33.631, -117.959, "beach", "intermediate", 210],
  ["Blackies", "Newport Beach, CA", 33.608, -117.930, "beach", "beginner", 210],
  ["Newport Point", "Newport Beach, CA", 33.592, -117.879, "beach", "advanced", 200],
  ["Crystal Cove", "Newport Beach, CA", 33.568, -117.834, "beach", "intermediate", 210],
  ["Brooks Street", "Laguna Beach, CA", 33.537, -117.787, "reef", "advanced", 210],
  ["Thalia Street", "Laguna Beach, CA", 33.541, -117.789, "beach", "intermediate", 210],
  ["Aliso Beach", "Laguna Beach, CA", 33.510, -117.752, "beach", "intermediate", 210],
  ["Strands", "Dana Point, CA", 33.471, -117.713, "beach", "intermediate", 215],
  ["San Onofre", "San Clemente, CA", 33.380, -117.567, "point", "beginner", 215],
  ["Uppers", "San Clemente, CA", 33.391, -117.593, "point", "advanced", 210],
  ["Cottons", "San Clemente, CA", 33.398, -117.595, "point", "advanced", 210],
  ["Churches", "San Clemente, CA", 33.372, -117.567, "point", "intermediate", 215],
  ["San Clemente Pier", "San Clemente, CA", 33.418, -117.622, "beach", "intermediate", 215],
  // ---- San Diego County ----
  ["Oceanside Harbor", "Oceanside, CA", 33.211, -117.401, "beach", "intermediate", 260],
  ["Tamarack", "Carlsbad, CA", 33.142, -117.342, "beach", "intermediate", 260],
  ["Ponto", "Carlsbad, CA", 33.082, -117.313, "beach", "intermediate", 255],
  ["Grandview", "Encinitas, CA", 33.069, -117.310, "reef", "intermediate", 255],
  ["Beacons", "Encinitas, CA", 33.060, -117.305, "beach", "intermediate", 255],
  ["Moonlight", "Encinitas, CA", 33.044, -117.297, "beach", "beginner", 255],
  ["D Street", "Encinitas, CA", 33.040, -117.296, "beach", "intermediate", 255],
  ["Pipes", "Encinitas, CA", 33.024, -117.288, "reef", "intermediate", 255],
  ["Seaside Reef", "Cardiff, CA", 33.012, -117.284, "reef", "intermediate", 255],
  ["Del Mar", "Del Mar, CA", 32.961, -117.267, "beach", "beginner", 255],
  ["Torrey Pines", "Del Mar, CA", 32.929, -117.260, "beach", "intermediate", 260],
  ["Scripps Pier", "La Jolla, CA", 32.866, -117.254, "beach", "intermediate", 260],
  ["Bird Rock", "La Jolla, CA", 32.813, -117.272, "reef", "advanced", 255],
  ["Tourmaline", "Pacific Beach, CA", 32.802, -117.260, "reef", "beginner", 260],
  ["Crystal Pier", "Pacific Beach, CA", 32.795, -117.257, "beach", "intermediate", 260],
  ["Mission Beach", "San Diego, CA", 32.771, -117.252, "beach", "intermediate", 260],
  ["Coronado", "Coronado, CA", 32.681, -117.190, "beach", "beginner", 255],
  ["Tijuana Sloughs", "Imperial Beach, CA", 32.549, -117.131, "beach", "advanced", 255]
];

const sizeByType = { beach: [2, 7], point: [2, 8], reef: [2, 9] };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const src = fs.readFileSync(SPOTS_FILE, "utf8");
const existingNames = new Set([...src.matchAll(/name: "([^"]+)"/g)].map(m => m[1].toLowerCase()));
const usedIds = new Set([...src.matchAll(/id: "([^"]+)"/g)].map(m => m[1]));

const rows = [];
for (const [name, region, lat, lon, type, level, facing] of NEW) {
  if (existingNames.has(name.toLowerCase())) { console.log("skip dup name:", name); continue; }
  let id = slug(name), n = 2;
  while (usedIds.has(id)) id = slug(name) + "-" + (n++);
  usedIds.add(id); existingNames.add(name.toLowerCase());
  rows.push({ id, name, region, lat, lon, facing, idealSwellDir: facing, idealSize: sizeByType[type], idealTide: "mid", level, type });
}

// ---- validate coordinates against the marine API ----
async function hasWaveData(s) {
  try {
    const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${s.lat}&longitude=${s.lon}&hourly=wave_height&forecast_days=1`;
    const j = await (await fetch(u)).json();
    return (j?.hourly?.wave_height || []).some(v => v != null);
  } catch { return false; }
}
async function pool(items, fn, size = 8) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

console.log(`Validating ${rows.length} new coordinates…`);
const ok = await pool(rows, hasWaveData);
const good = rows.filter((_, i) => ok[i]);
const bad = rows.filter((_, i) => !ok[i]);
if (bad.length) console.log("DROPPED (no ocean data):", bad.map(b => b.name).join(", "));

const toJs = s =>
  `  { id: ${JSON.stringify(s.id)}, name: ${JSON.stringify(s.name)}, region: ${JSON.stringify(s.region)}, lat: ${s.lat}, lon: ${s.lon},\n` +
  `    facing: ${s.facing}, idealSwellDir: ${s.idealSwellDir}, idealSize: [${s.idealSize[0]}, ${s.idealSize[1]}], idealTide: "${s.idealTide}", level: "${s.level}", type: "${s.type}",\n` +
  `    note: ${JSON.stringify(`${s.name} — a ${s.type} break near ${s.region}.`)} }`;

const block = "\n  // ───────────── Added from the California directory ─────────────\n" +
  good.map(toJs).join(",\n") + ",\n";

// Insert before the marquee out-of-state section.
const marker = "  // ───────────── Marquee out-of-state ─────────────";
const updated = src.replace(marker, block + marker);
fs.writeFileSync(SPOTS_FILE, updated);
console.log(`Added ${good.length} spots. Total now ~${[...updated.matchAll(/  { id:/g)].length}.`);
