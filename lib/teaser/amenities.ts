/** Features and amenities a user can tick (or that the summarizer finds in their text), each with an icon. */

export interface Amenity {
  id: string;
  label: string;
  icon: string;
  group: "Unit" | "Building" | "Leisure" | "Wellness" | "Outdoor" | "Nearby" | "Land & commercial";
  /** Words that reveal it in a description (lower case). */
  phrases: string[];
}

export const AMENITIES: Amenity[] = [
  { id: "furnished", label: "Fully furnished", icon: "sofa", group: "Unit", phrases: ["fully furnished", "furnished", "ff unit"] },
  { id: "semi_furnished", label: "Semi-furnished", icon: "armchair", group: "Unit", phrases: ["semi furnished", "semi-furnished"] },
  { id: "aircon", label: "Air-conditioned", icon: "snowflake", group: "Unit", phrases: ["aircon", "air con", "air-condition", "split type", "ac units"] },
  { id: "balcony", label: "Balcony", icon: "door-open", group: "Unit", phrases: ["balcony", "lanai", "terrace"] },
  { id: "maids_room", label: "Maid's room", icon: "bed", group: "Unit", phrases: ["maid's room", "maids room", "helper's room", "service area"] },
  { id: "kitchen", label: "Modern kitchen", icon: "chef-hat", group: "Unit", phrases: ["kitchen", "pantry", "cabinets"] },
  { id: "laundry", label: "Laundry area", icon: "washing-machine", group: "Unit", phrases: ["laundry", "washer"] },
  { id: "smart_home", label: "Smart home", icon: "wifi", group: "Unit", phrases: ["smart home", "smart lock", "fiber ready", "fibre ready", "wifi"] },
  { id: "parking", label: "Parking", icon: "square-parking", group: "Unit", phrases: ["parking", "car park", "garage", "carport"] },
  { id: "corner", label: "Corner unit", icon: "layout-grid", group: "Unit", phrases: ["corner unit", "corner lot", "end unit"] },
  { id: "view", label: "Panoramic view", icon: "mountain", group: "Unit", phrases: ["view", "overlooking", "skyline", "panoramic"] },
  { id: "security", label: "24/7 security", icon: "shield-check", group: "Building", phrases: ["24/7 security", "24 hour security", "security", "guard"] },
  { id: "cctv", label: "CCTV", icon: "cctv", group: "Building", phrases: ["cctv", "surveillance"] },
  { id: "elevator", label: "Elevators", icon: "arrow-up-down", group: "Building", phrases: ["elevator", "lift"] },
  { id: "backup_power", label: "Backup power", icon: "zap", group: "Building", phrases: ["backup power", "generator", "back-up power", "genset"] },
  { id: "water", label: "Water reservoir", icon: "droplets", group: "Building", phrases: ["water tank", "cistern", "water reservoir", "deep well"] },
  { id: "lobby", label: "Grand lobby", icon: "hotel", group: "Building", phrases: ["lobby", "concierge", "reception"] },
  { id: "gated", label: "Gated community", icon: "fence", group: "Building", phrases: ["gated", "exclusive village", "subdivision", "enclave"] },
  { id: "business_center", label: "Business center", icon: "briefcase", group: "Building", phrases: ["business center", "co-working", "coworking", "function room"] },
  { id: "pool", label: "Swimming pool", icon: "waves-ladder", group: "Leisure", phrases: ["pool", "swimming"] },
  { id: "clubhouse", label: "Clubhouse", icon: "building", group: "Leisure", phrases: ["clubhouse", "club house"] },
  { id: "playground", label: "Playground", icon: "baby", group: "Leisure", phrases: ["playground", "play area", "kids area", "children's"] },
  { id: "game_room", label: "Game room", icon: "gamepad-2", group: "Leisure", phrases: ["game room", "billiards", "play room"] },
  { id: "theater", label: "Mini theater", icon: "clapperboard", group: "Leisure", phrases: ["theater", "theatre", "cinema"] },
  { id: "courts", label: "Sports courts", icon: "volleyball", group: "Leisure", phrases: ["basketball", "tennis", "court", "sports"] },
  { id: "function_hall", label: "Function hall", icon: "trophy", group: "Leisure", phrases: ["function hall", "events place", "party room"] },
  { id: "gym", label: "Fitness gym", icon: "dumbbell", group: "Wellness", phrases: ["gym", "fitness"] },
  { id: "spa", label: "Spa and sauna", icon: "flower-2", group: "Wellness", phrases: ["spa", "sauna", "steam"] },
  { id: "jogging", label: "Jogging path", icon: "footprints", group: "Wellness", phrases: ["jogging", "running path", "walking path"] },
  { id: "bike", label: "Bike lanes", icon: "bike", group: "Wellness", phrases: ["bike", "cycling"] },
  { id: "garden", label: "Landscaped gardens", icon: "trees", group: "Outdoor", phrases: ["garden", "landscaped", "park", "green space"] },
  { id: "roof_deck", label: "Roof deck", icon: "sunset", group: "Outdoor", phrases: ["roof deck", "rooftop", "sky lounge", "sky deck"] },
  { id: "pet_friendly", label: "Pet-friendly", icon: "dog", group: "Outdoor", phrases: ["pet friendly", "pet-friendly", "pets allowed"] },
  { id: "beach", label: "Beach access", icon: "umbrella", group: "Outdoor", phrases: ["beach", "beachfront", "seaside", "shore"] },
  { id: "near_transit", label: "Near train stations", icon: "train-front", group: "Nearby", phrases: ["mrt", "lrt", "train", "station", "transit"] },
  { id: "near_mall", label: "Near malls", icon: "shopping-bag", group: "Nearby", phrases: ["mall", "shopping", "retail strip"] },
  { id: "near_school", label: "Near schools", icon: "graduation-cap", group: "Nearby", phrases: ["school", "university", "college", "campus"] },
  { id: "near_hospital", label: "Near hospitals", icon: "hospital", group: "Nearby", phrases: ["hospital", "medical", "clinic"] },
  { id: "near_airport", label: "Near the airport", icon: "plane", group: "Nearby", phrases: ["airport", "naia", "terminal"] },
  { id: "near_church", label: "Near churches", icon: "church", group: "Nearby", phrases: ["church", "chapel", "parish"] },
  { id: "near_highway", label: "Highway access", icon: "car", group: "Nearby", phrases: ["slex", "nlex", "cavitex", "skyway", "c5", "edsa", "highway", "expressway"] },
  { id: "clean_title", label: "Clean title", icon: "award", group: "Land & commercial", phrases: ["clean title", "tct", "cct", "titled"] },
  { id: "road_frontage", label: "Road frontage", icon: "map-pin", group: "Land & commercial", phrases: ["frontage", "along the highway", "main road", "national road"] },
  { id: "commercial_zone", label: "Commercial zoning", icon: "store", group: "Land & commercial", phrases: ["commercial", "mixed use", "mixed-use", "zoned"] },
  { id: "loading_bay", label: "Loading bays", icon: "warehouse", group: "Land & commercial", phrases: ["loading", "truck", "container van", "forklift"] },
  { id: "farm_ready", label: "Farm-ready land", icon: "sprout", group: "Land & commercial", phrases: ["farm", "agricultural", "irrigation", "fruit trees"] },
  { id: "income", label: "With tenants / income", icon: "banknote", group: "Land & commercial", phrases: ["with tenant", "income generating", "rental income", "tenanted"] },
];

export const AMENITY = Object.fromEntries(AMENITIES.map((a) => [a.id, a]));

/** Label and icon for an amenity id, including user-typed ones ("custom:Rooftop bar"). */
export function amenityInfo(id: string): { label: string; icon: string } {
  if (id.startsWith("custom:")) return { label: id.slice(7), icon: "circle-check" };
  const a = AMENITY[id];
  return a ? { label: a.label, icon: a.icon } : { label: id, icon: "circle-check" };
}

/** Amenities mentioned in free text. */
export function findAmenities(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9/'\- ]+/g, " ").replace(/\s+/g, " ")} `;
  const found = AMENITIES.filter((a) => a.phrases.some((p) => t.includes(p.length <= 4 ? ` ${p} ` : p))).map((a) => a.id);
  // "semi furnished" also contains "furnished".
  return found.includes("semi_furnished") ? found.filter((x) => x !== "furnished") : found;
}
