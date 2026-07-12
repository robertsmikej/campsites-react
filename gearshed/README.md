# GearShed 🏕

**Your camping & overlanding gear, cataloged by AI.**

Snap a photo of a gear pile in your garage, a packed truck bed, or a set-up campsite. GearShed
sends it to Claude vision, which returns every piece of gear it can find — with bounding boxes.
You review the detections on top of the photo (tap a box to keep or discard, rename, re-categorize),
then save them into a searchable inventory with personal ratings, notes, review links, and
Amazon affiliate links.

Built with **Expo (React Native + TypeScript)** — runs on iOS (primary target), Android, and web.

## Features (implemented)

- **📷 AI gear scan** — photo → Claude vision (`claude-opus-4-8`) → structured JSON of detected
  items (name, category, brand guess, confidence, normalized bounding box). Strict JSON schema via
  the API's structured outputs, so parsing never breaks.
- **🔲 Bounding-box curation UI** — detections drawn as numbered boxes over the photo. Tap a box
  (or its card) to keep/discard; edit names, brands, and categories inline before anything hits
  your inventory.
- **🎒 Inventory** — searchable, filterable by category (shelter, sleep, kitchen, water, lighting,
  tools, recovery, electronics, clothing, safety, storage, furniture). Manual add for anything the
  AI misses. Persisted locally with AsyncStorage.
- **⭐ Personal reviews** — 5-star rating + free-form notes ("would I buy this again?") per item.
- **🔗 Research & buy links** — one tap to Amazon (with **your affiliate tag** appended), REI,
  YouTube reviews, and Google reviews for any item.
- **🧾 Packing lists** — create a list per trip; picking a trip type (car-camping / overlanding /
  backpacking) auto-fills it from your inventory by category. Check items off as you pack; shows
  total pack weight when items have weights.
- **🧪 Demo mode** — sample detections out of the box, so the whole flow works before an API key
  is configured (Settings → toggle off + paste key for live scans).

## Getting started

```bash
cd gearshed
npm install
npm run ios      # or: npm start, then open in Expo Go
```

For real AI scans: Settings tab → paste an Anthropic API key (console.anthropic.com) → turn off
Demo mode.

> ⚠️ The app currently calls the Anthropic API directly with a user-supplied key — fine for
> personal use and development. Before a public App Store release, move `src/services/claude.ts`
> behind a small backend endpoint so no key ships in the binary.

## Architecture

```
App.tsx                     Navigation: bottom tabs + stack
src/
  types.ts                  GearItem, DetectedItem, PackingList, categories, trip presets
  theme.ts                  Colors / spacing
  navigation.ts             Route param types
  components/ui.tsx         Button, Chip, Stars, EmptyState
  store/useGearStore.ts     Zustand store, persisted to AsyncStorage
  services/claude.ts        Claude vision gear detection (+ mock mode)
  services/links.ts         Amazon affiliate / REI / YouTube / Google link builders
  screens/
    ScanScreen              Camera / library → AI analysis
    ReviewDetectionsScreen  Photo + bounding boxes + curation
    InventoryScreen         Search, filter, browse
    GearDetailScreen        Ratings, notes, links, quantity, weight
    PackingListsScreen      Trip lists (+ auto-fill by trip type)
    PackingListDetailScreen Check-off + edit list membership
    SettingsScreen          API key, affiliate tag, demo mode
```

## Roadmap ideas

Near-term:
- **Product matching** — have the AI suggest the exact product/model, then link to a specific
  Amazon ASIN instead of a search page (higher affiliate conversion).
- **Barcode / receipt scan** — add gear by scanning a UPC or a receipt photo.
- **Gap analysis** — "you have no recovery boards or first-aid kit for an overlanding trip";
  suggested-gear list per trip type doubles as an affiliate surface.
- **Multi-photo scan sessions** — walk around the garage, batch photos into one detection run,
  dedupe items across shots.

Later:
- **Trip / campsite log** — pair campsite photos with the gear you brought; "what did I pack last
  time it worked well?"
- **Maintenance reminders** — reproof the tent, wax zippers, rotate stove fuel, re-tension the RTT
  bolts; per-item schedules with notifications.
- **Lending tracker** — mark gear as loaned to a friend, with reminders.
- **Garage value & insurance export** — total replacement value, CSV/PDF export of the inventory
  with photos for insurance claims.
- **Wishlist & price watch** — items you want, with price-drop alerts (more affiliate surface).
- **Community loadouts** — share a trip loadout as a page; viewers' purchases route through your
  affiliate links.
- **Cloud sync & accounts** — move persistence from AsyncStorage to a backend (the natural moment
  to also proxy the AI calls).

## Notes

- This app lives in the `campsites-react` repo temporarily (the session's GitHub integration
  cannot create repositories). To split it into its own repo: create an empty `gearshed` repo on
  GitHub, then push this directory's contents to it (`git subtree split` keeps history, or just
  copy the folder — everything is self-contained).
