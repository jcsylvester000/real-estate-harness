/**
 * Property Teaser document model. One JSON document per project (stored in `teasers.data`), rendered by one
 * canvas renderer for the editor, thumbnails, PDF and video, and mapped to native objects for PowerPoint.
 * Coordinates are in design pixels: decks 1920×1080; trailers 1920×1080 or 1080×1920 (vertical).
 */

export type TeaserKind = "deck" | "trailer";
export type Anim = "none" | "fade" | "rise" | "drop" | "zoom" | "slideL" | "slideR" | "pop" | "wipe";
export type Transition = "none" | "fade" | "slide" | "zoom";

interface Base {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rot?: number;
  /** 0–1 */
  opacity?: number;
  locked?: boolean;
  /** Trailer and preview entrance animation; delay in seconds from the start of the slide. */
  anim?: { type: Anim; delay?: number; dur?: number };
  /**
   * Bound to project details (property.name, property.price, agent.phone, brand.logo, photo:0, amenity:2…).
   * Bound elements update when the details change; editing one by hand unbinds it.
   */
  bind?: string;
  /** Generated from a list (amenities, highlights). Replaced when the list changes, unless the slide is detached. */
  auto?: boolean;
  name?: string;
}

export interface TextEl extends Base {
  type: "text";
  text: string;
  font: string;
  size: number;
  weight: 400 | 700;
  italic?: boolean;
  underline?: boolean;
  color: string;
  align: "left" | "center" | "right";
  /** Multiple of the font size. */
  lineHeight: number;
  /** Extra space between letters in px. */
  spacing?: number;
  upper?: boolean;
  shadow?: boolean;
  /** Box fill behind the text. */
  bg?: string;
  pad?: number;
  radius?: number;
}

export type ShapeKind = "rect" | "ellipse" | "triangle" | "line" | "diamond" | "star" | "arrow" | "pill";
export interface ShapeEl extends Base {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  /** Linear gradient instead of a flat fill. */
  grad?: { from: string; to: string; angle: number };
  stroke?: string;
  strokeW?: number;
  radius?: number;
}

export interface ImageEl extends Base {
  type: "image";
  /** "asset:<id>" (stored upload), a data: URL, or null for an empty photo frame. */
  src: string | null;
  fit: "cover" | "contain";
  radius?: number;
  /** Colour wash over the photo (e.g. "#0e192f66") so text on top stays readable. */
  overlay?: string;
  /** Slow zoom while the slide plays (trailers). */
  kenburns?: boolean;
  /** Focus point for cover crops, 0–1. */
  fx?: number;
  fy?: number;
  stroke?: string;
  strokeW?: number;
  credit?: string;
}

export interface IconEl extends Base {
  type: "icon";
  icon: string;
  color: string;
  strokeW?: number;
  /** Filled circle or rounded square behind the icon. */
  bg?: string;
  bgShape?: "circle" | "square";
}

export type El = TextEl | ShapeEl | ImageEl | IconEl;

export interface Slide {
  id: string;
  /** What the slide shows; "amenities", "highlights", "gallery" regenerate their auto elements from the details. */
  role?: "cover" | "overview" | "description" | "highlights" | "amenities" | "gallery" | "location" | "pricing" | "contact" | "custom";
  bg: string;
  bgGrad?: { from: string; to: string; angle: number };
  /** Seconds on screen (trailers, and PowerPoint auto-advance for trailers). */
  duration: number;
  transition: Transition;
  /** Stop regenerating auto elements from the details. */
  detached?: boolean;
  /** How this slide's auto elements are generated (amenity grid, highlight list, photo grid) and where. */
  gen?: Gen;
  elements: El[];
}

export interface Gen {
  type: "amenities" | "highlights" | "gallery" | "nearby" | "facts";
  box: { x: number; y: number; w: number; h: number };
  /** Layout style: columns, card or plain, icon size… */
  style: { cols?: number; card?: boolean; iconSize?: number; textSize?: number; numbered?: boolean; dark?: boolean; anim?: Anim; max?: number; from?: number };
}

export interface Brand {
  /** asset:<id> or data: URL */
  logo: string | null;
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  paper: string;
  headFont: string;
  bodyFont: string;
}

export interface PropertyDetails {
  name: string;
  tagline: string;
  /** "sale" or "lease" */
  transaction: "sale" | "lease";
  kind: string;
  price: number | null;
  /** Free text that overrides the formatted price ("Starts at ₱8.5M", "Price on request"). */
  priceNote: string;
  location: string;
  city: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floorArea: number | null;
  lotArea: number | null;
  parking: number | null;
  description: string;
  highlights: string[];
  /** Amenity ids from lib/teaser/amenities.ts, or "custom:Label". */
  amenities: string[];
  /** asset:<id> list; photo:0 is the hero. */
  photos: string[];
  paymentTerms: string;
  nearby: string[];
  listingCode?: string;
}

export interface AgentDetails {
  name: string;
  title: string;
  phone: string;
  email: string;
  license: string;
  company: string;
  website: string;
}

export interface TeaserDoc {
  v: 1;
  kind: TeaserKind;
  templateId: string;
  width: number;
  height: number;
  brand: Brand;
  property: PropertyDetails;
  agent: AgentDetails;
  slides: Slide[];
}

export const emptyProperty = (): PropertyDetails => ({
  name: "",
  tagline: "",
  transaction: "sale",
  kind: "",
  price: null,
  priceNote: "",
  location: "",
  city: "",
  bedrooms: null,
  bathrooms: null,
  floorArea: null,
  lotArea: null,
  parking: null,
  description: "",
  highlights: [],
  amenities: [],
  photos: [],
  paymentTerms: "",
  nearby: [],
});

export const emptyAgent = (): AgentDetails => ({ name: "", title: "", phone: "", email: "", license: "", company: "", website: "" });

let seq = 0;
export const uid = (p = "e") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
