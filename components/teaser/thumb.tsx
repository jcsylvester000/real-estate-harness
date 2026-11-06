"use client";
import { useEffect, useRef } from "react";
import { drawSlide, ensureFonts, type ImageCache } from "@/lib/teaser/render";
import type { Slide, TeaserDoc } from "@/lib/teaser/types";

/** A small live render of one slide (slide strip, template gallery). */
export function SlideThumb({ doc, slide, images, width, tick = 0, placeholders = true }: { doc: TeaserDoc; slide: Slide; images: ImageCache; width: number; tick?: number; placeholders?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = Math.round((width * doc.height) / doc.width);
  useEffect(() => {
    let alive = true;
    const draw = () => {
      const c = ref.current;
      if (!c || !alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(width * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext("2d")!;
      const s = (width * dpr) / doc.width;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      drawSlide(ctx, doc, slide, { images, placeholders });
    };
    const id = setTimeout(draw, 30);
    void ensureFonts(doc).then(draw);
    const off = images.onChange(draw);
    return () => {
      alive = false;
      clearTimeout(id);
      off();
    };
  }, [doc, slide, images, width, h, tick, placeholders]);
  return <canvas ref={ref} style={{ width, height: h, display: "block" }} aria-hidden />;
}

/** Sample details so template previews look like a real teaser before the user types anything. */
export const SAMPLE = {
  name: "The Residences at Alabang",
  tagline: "Resort-style living in the south",
  transaction: "sale" as const,
  kind: "House and lot",
  price: 28_500_000,
  priceNote: "",
  location: "Ayala Alabang, Muntinlupa",
  city: "Muntinlupa",
  bedrooms: 4,
  bathrooms: 3,
  floorArea: 320,
  lotArea: 450,
  parking: 2,
  description: "A bright corner home inside an exclusive gated village, minutes from schools, malls and the Skyway.",
  highlights: ["Corner lot with garden", "Walk to schools and Festival Mall", "Clean title, ready for transfer"],
  amenities: ["pool", "clubhouse", "security", "garden", "near_school", "near_mall"],
  photos: [],
  paymentTerms: "20% down payment, balance through bank or Pag-IBIG financing.",
  nearby: ["Festival Mall", "De La Salle Zobel", "Asian Hospital"],
};
