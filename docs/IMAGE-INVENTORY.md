# Hotel Photography Inventory - Phase 5

Eleven assets ship with the frontend bundle: ten stock photographs plus
the commissioned brand image of The Aurelia Collection itself. The
database `image_url` column stays NULL (V3 migration): the catalog in
`frontend/src/data/imageCatalog.ts` owns placement, and any future
database URL wins over the catalog.

## Asset inventory

| Asset | Subject | Best role |
| --- | --- | --- |
| aurelia-twilight-entrance | The Aurelia Collection entrance at twilight: palm-lined drive, canopy lights, limousine under a violet-orange sky | **Homepage hero** - brand-level imagery, claims nothing about any single seeded property |
| img-1 | Pool deck, white parasols, timber floor, palms | Amenity / gallery filler, collection-level |
| img-2 | Guest room, warm tones, balcony over palms and hills | Manali cover (only photo with a mountain view) + room interiors |
| img-3 | Infinity pool at golden hour, minimalist white architecture | Homepage editorial block |
| img-4 | Golden filigree bridge over lagoon pool, curved hotel facade | Udaipur cover (ornate craft over water) |
| img-5 | Contemporary guest room, grey/white, mirrored wardrobe | Generic room interior in galleries |
| img-6 | Infinity pool dissolving into the sea, wooden sunbeds | Former hero; remains in the Goa gallery pool |
| img-7 | Resort pool with jacuzzi, palms, sea glimpse | Goa cover + Goa destination card |
| img-8 | Courtyard pool with fountain, arched balconies | Jaipur cover (courtyard is literally the hotel's theme) + Jaipur destination card |
| img-9 | Grand heritage lobby: marble, brass lifts, mosaic murals | Kochi cover (reads as a colonial-era lobby) + Kochi destination card |
| img-10 | Large pool, orange loungers, neoclassical facade, foreign signage | Benched - visible non-Indian signage would misrepresent the circuit |

The hero asset is stored as `src/assets/brand/aurelia-twilight-entrance.jpg`
(a quality-87 JPEG conversion of the delivered PNG; photographic content
gains nothing from PNG weight).

## Placement rules

1. Collection-level slots first (hero, editorial block). These make no
   claim about a specific property.
2. Hotel covers are matched by visual relevance, never by wishful
   thinking. Every pairing that is a stretch carries a `note` in the
   catalog, and galleries omit photos that would misrepresent the
   property (Manali gets a two-shot gallery rather than a forced pool
   photo).
3. Galleries reuse the collection-level pool; a hotel never claims
   another hotel's cover.
4. `SmartImage` renders a branded fallback when an asset is missing, so
   no broken image icons ever appear.

## Honest pairing notes

- Jaipur `img-8`: courtyard pool and arched balconies echo the haveli
  courtyard; no true heritage facade exists in the set yet.
- Udaipur `img-4`: ornate goldwork over water suits the city's
  character; the facade is far more modern than a stone villa.
- Kochi `img-9`: reads as a colonial-era grand lobby; the mosaic murals
  are American, not Kerala-specific.
- Manali `img-2`: the only photo with mountains behind the balcony;
  palms break the Himalayan illusion, but it matches the lodge's
  "mountain-facing balconies" copy.

When real property photography arrives, replace the cover and gallery
entries per hotel in `imageCatalog.ts` - or set `image_url` on the hotel
row, which overrides the catalog automatically.
