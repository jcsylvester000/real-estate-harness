/**
 * Icon set for Property Teaser (Lucide, ISC licence): real-estate, amenity and contact icons.
 * One source for the editor, the canvas renderer and exports (rendered to SVG, then to PNG for PowerPoint/Word).
 */
import { Bed, Bath, Car, Ruler, Maximize, House, Building, BuildingComplex, Trees, WavesLadder, WavesHorizontal, Dumbbell, ShieldCheck, Wifi, Snowflake, Sun, Mountain, MapPin, TrainFront, ShoppingBag, GraduationCap, Hospital, Plane, Coffee, Utensils, Baby, Dog, Sofa, Key, Fence, Flower, Leaf, Zap, Droplets, Flame, Cctv, ArrowUpDown, Briefcase, Gamepad2, Clapperboard, Bike, Footprints, Star, Award, Phone, Mail, Globe, MessageCircle, Calendar, Clock, Tag, Banknote, Percent, Handshake, Ship, Umbrella, Sunset, Compass, Heart, CircleCheck, Sparkles, Crown, Gem, Layers, LayoutGrid, Warehouse, Store, Factory, Tractor, Wheat, TreePine, Landmark, Bus, Church, Flower2, Trophy, ChefHat, WashingMachine, Lamp, Armchair, DoorOpen, Lock, SquareParking, Fan, Tv, Sprout, TentTree, MountainSnow, Volleyball, PersonStanding, Hotel, Package, Camera } from "lucide";

type IconNode = [string, Record<string, string | number>][];

export const ICONS: Record<string, IconNode> = {
  "bed": Bed,
  "bath": Bath,
  "car": Car,
  "ruler": Ruler,
  "maximize": Maximize,
  "house": House,
  "building": Building,
  "building-complex": BuildingComplex,
  "trees": Trees,
  "waves-ladder": WavesLadder,
  "waves-horizontal": WavesHorizontal,
  "dumbbell": Dumbbell,
  "shield-check": ShieldCheck,
  "wifi": Wifi,
  "snowflake": Snowflake,
  "sun": Sun,
  "mountain": Mountain,
  "map-pin": MapPin,
  "train-front": TrainFront,
  "shopping-bag": ShoppingBag,
  "graduation-cap": GraduationCap,
  "hospital": Hospital,
  "plane": Plane,
  "coffee": Coffee,
  "utensils": Utensils,
  "baby": Baby,
  "dog": Dog,
  "sofa": Sofa,
  "key": Key,
  "fence": Fence,
  "flower": Flower,
  "leaf": Leaf,
  "zap": Zap,
  "droplets": Droplets,
  "flame": Flame,
  "cctv": Cctv,
  "arrow-up-down": ArrowUpDown,
  "briefcase": Briefcase,
  "gamepad-2": Gamepad2,
  "clapperboard": Clapperboard,
  "bike": Bike,
  "footprints": Footprints,
  "star": Star,
  "award": Award,
  "phone": Phone,
  "mail": Mail,
  "globe": Globe,
  "message-circle": MessageCircle,
  "calendar": Calendar,
  "clock": Clock,
  "tag": Tag,
  "banknote": Banknote,
  "percent": Percent,
  "handshake": Handshake,
  "ship": Ship,
  "umbrella": Umbrella,
  "sunset": Sunset,
  "compass": Compass,
  "heart": Heart,
  "circle-check": CircleCheck,
  "sparkles": Sparkles,
  "crown": Crown,
  "gem": Gem,
  "layers": Layers,
  "layout-grid": LayoutGrid,
  "warehouse": Warehouse,
  "store": Store,
  "factory": Factory,
  "tractor": Tractor,
  "wheat": Wheat,
  "tree-pine": TreePine,
  "landmark": Landmark,
  "bus": Bus,
  "church": Church,
  "flower-2": Flower2,
  "trophy": Trophy,
  "chef-hat": ChefHat,
  "washing-machine": WashingMachine,
  "lamp": Lamp,
  "armchair": Armchair,
  "door-open": DoorOpen,
  "lock": Lock,
  "square-parking": SquareParking,
  "fan": Fan,
  "tv": Tv,
  "sprout": Sprout,
  "tent-tree": TentTree,
  "mountain-snow": MountainSnow,
  "volleyball": Volleyball,
  "person-standing": PersonStanding,
  "hotel": Hotel,
  "package": Package,
  "camera": Camera,
} as unknown as Record<string, IconNode>;

export const ICON_NAMES = Object.keys(ICONS);

const esc = (v: string | number) => String(v).replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);

/** SVG markup for an icon (24×24 viewBox) drawn at `size` px. */
export function iconSvg(name: string, color: string, size = 96, strokeWidth = 2) {
  const node = ICONS[name] ?? ICONS.sparkles!;
  const body = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${esc(v)}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${esc(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export const iconDataUrl = (name: string, color: string, size = 96, strokeWidth = 2) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name, color, size, strokeWidth))}`;
