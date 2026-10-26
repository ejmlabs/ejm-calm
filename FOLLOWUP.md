# Follow-up

- Spout was over-bright (additive sprites above the tone-map white point, plus a matching blob in the water mirror). This pass makes it a short translucent mist column on layer 1 so the Water mirror skips it. Monitor it on a device.
- Cloudflare zone injects its Web Analytics beacon / inline script. The strict CSP blocks it (harmless console errors). Disable RUM/beacon injection on the zone if those errors should go away.
- Horizon seam under ACES can still show a thin bright water/sky line.
- Desktop seed 1234 still frames the whale very close, so the head reads as a rounded end-on mass. Pull the default camera back slightly if that crop should show the full side profile.
- Land is shaded per fragment from the live sun direction, haze colours and a day brightness, so it follows the day cycle; the vertex colours carry the palette only.
- Mobile breach/spout camera still does not reliably fill 35–50% of screen width; needs a bbox-centred look and a screen-width check.
- Land haze colours are measured per time-of-day preset (sky just above the horizon); if the sky presets change, re-measure them.
- Shallow-water tint is subtle from boat height; a higher camera shows it more.
- Sail billow is visible up close; at distance a tall ship can still read as one pale panel.
- Saved camera pitch/distance can override the portrait defaults after a refresh.
- Real-device figures are still owed for the migration: the p99 stream frame (spec: under 3 ms on a phone-class device), the environment map refresh frame (spec: at most 8 ms over the average on the desktop profile), and frame time at cruise on a phone. Software GL numbers are recorded in `openspec/changes/add-ocean-migration/tasks.md` and are not those.
- Forward progress is much better but not absolute: seed 34 makes 0.5 km in its first five minutes (a gulf in the opening sea) and nets 0.55 of its path over the hour; seed 38 loses ten minutes at the start. The planner looks 12.8 km ahead on a 400 m lattice and still cannot see thin land bars or tell a long dead end from open sea; a proper global path search would. `tools/seed-sweep.ts` is the gate.
- At cruise the follower camera trails the whale by about 2 v / 2.6 m on top of the 25 percent pull-back, so the whale sits further off than the pull-back alone says (about 40 m at 28 m/s); the whale stays inside the middle 80 percent of the frame.
- Rocks and islets stand one per 2 km cell, only where the sea is open (no natural coast within a kilometre), so something passes every couple of minutes without narrowing a way through; they add land tiles with meshes (up to about 125 at once on seed 42, against 68 before the change began).
