# Property Teaser

Design presentation decks and teaser trailers for a property, then export them for clients.

- **30 templates:** 20 presentation decks and 10 trailers. Six trailers are 16:9 landscape; four are 9:16 vertical, for Reels, TikTok, Stories and Messenger.
- **Your brand:** upload a logo (PNG or SVG; SVG is converted to PNG in the browser). Set five brand colours and a heading/body font pair. Every template uses brand colour tokens, so one change recolours the whole design.
- **Your details:** fill in the property, the price, the facts, highlights, features and amenities (47 with icons, plus your own), nearby places, payment terms and your contact details. Text on the slides is *bound* to these details and updates as you type. Typing over a bound text on the slide makes it your own.
- **Write it for me (no AI):** paste any notes, a Facebook post or brochure text. In `lib/teaser/copy.ts` it:
  - removes phone numbers, emails, links, hashtags, emojis and "PM me" lines;
  - fixes ALL-CAPS shouting;
  - finds bedrooms, baths, floor and lot area, parking, price, kind and place;
  - writes taglines from patterns;
  - picks the most central sentences for a description of up to 60 words (or a longer one of up to 120);
  - pulls out highlights and amenities.

  **Polish with AI** appears only when you have added your own AI key in Settings.
- **Canva-style editing:**
  - Select, move with snapping guides, resize and rotate (Shift snaps to 15°).
  - Marquee-select, align, change the layer order, lock, duplicate, undo and redo.
  - Double-click text to type.
  - Text: fonts (12 self-hosted families), size, bold, italic, underline, upper case, alignment, line height, letter spacing, shadow and background.
  - Shapes: rectangle, rounded, pill, circle, triangle, diamond, star, arrow and line, with fill, outline and corner radius.
  - Icons: 97 icons.
  - Photos: fill or fit, focus point, rounded corners, colour wash, and Ken Burns zoom for trailers.
  - Per-element animations for trailers and previews.
- **Photos:**
  - Upload from your computer; photos are resized in the browser before upload.
  - Search free Creative Commons images on Openverse; the credit line is kept with the image.
  - Paste an image link.
  - The property photo list fills the templates' frames; the first photo is the cover.

## Exports

| Format | Notes |
|---|---|
| PowerPoint (.pptx) | Text and basic shapes stay editable. Photos, icons and effects are pictures. **Trailers** get timed auto-advance with fade, push or zoom transitions and loop, so the file plays by itself. Element animations are not exported to PowerPoint. |
| PDF | One page per slide, drawn by the same renderer as the editor. |
| Word (.docx) | A property brief: logo, title, key facts table, description, highlights, amenities, location, terms and contact, then the slides (a storyboard with timings for trailers). |
| Video (MP4) | Made on your computer with WebCodecs (H.264, 30 fps, full HD or 1080×1920), faster than real time in Chrome and Edge. Where H.264 encoding is not available, it records WebM instead. |
| PNG | The current slide. |

Fonts are drawn into the PDF, the Word slide images and the video. PowerPoint uses the font if it is installed, otherwise a similar font.

## Saved designs: same look, different property

- **Save design** (editor top bar) stores the project without its property details: slides, layout, colours, fonts, logo and contact stay. Texts bound to details (name, price, photos, amenities…) switch with the property. If a text you typed by hand mentions this property, you are warned, because it will not switch.
- Saved designs appear first under **Templates → My designs** in the editor, in the template gallery, in Deal Desk's "/" Property Teaser and in the intake card's Design list.
- **Use for listings…** (Property Teaser home → My designs): pick up to 20 listings; each gets its own project named "Listing · Design". Add photos to each before exporting (listings have no photos).
- Code: `lib/teaser/listing.ts` (`propertyFromListing`, `toDesign`, `fromDesign`, `stuckTexts`), `components/teaser/designs.tsx`, table `teaser_templates` (migration 0008), drivers `teaser.templates`, `teaser.getTemplate`, `teaser.saveTemplate`, `teaser.deleteTemplate`.

## How it fits together

```text
lib/teaser/types.ts      document model (slides, elements, brand, property, agent)
lib/teaser/templates.ts  30 templates: themes + slide layouts + generators (facts, amenities, highlights, gallery, nearby)
lib/teaser/format.ts     brand colour tokens ($primary/40), detail bindings, price and fact text
lib/teaser/render.ts     canvas renderer: editor, thumbnails, PDF, PNG, video frames
lib/teaser/copy.ts       no-AI copywriter · amenities.ts catalogue · icons.ts (Lucide)
components/teaser/       editor UI (stage, toolbar, panels), exports (export.ts), image prep
lib/server/services/teasers.ts  projects, images, Openverse search, safe link import, Polish with AI
app/api/teaser-assets/[id]       serves a stored image to its owner only
```

Security notes:
- **Images:** only real JPEG, PNG, WebP or GIF bytes are stored (checked by content, not by name). Images are served with `default-src 'none'` to their owner only.
- **Link import:** works only for http and https addresses on the public internet. Private, loopback and link-local addresses are refused, and every redirect is checked again. The download stops at 8 MB, has a 15-second time limit, and must be an image.

## Teaching it more templates

Add an entry to `TEMPLATES` in `lib/teaser/templates.ts`. Give it a theme (colours, fonts, motif, cover style) and a recipe of slide layouts. `tests/unit/teaser.test.ts` checks every template.
