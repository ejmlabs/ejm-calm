# Follow-up

- Spout was over-bright (additive sprites above the tone-map white point, plus a matching blob in the water mirror). This pass makes it a short translucent mist column on layer 1 so the Water mirror skips it. Monitor it on a device.
- Cloudflare zone injects its Web Analytics beacon / inline script. The strict CSP blocks it (harmless console errors). Disable RUM/beacon injection on the zone if those errors should go away.
- Horizon seam under ACES can still show a thin bright water/sky line.
- Desktop seed 1234 still frames the whale very close, so the head reads as a rounded end-on mass. Pull the default camera back slightly if that crop should show the full side profile.
- Land is unlit with sun shading and range haze baked into vertex colours; it does not react to the slow sun wobble.
- Mobile breach/spout camera still does not reliably fill 35–50% of screen width; needs a bbox-centred look and a screen-width check.
- Land haze colours are measured per time-of-day preset (sky just above the horizon); if the sky presets change, re-measure them.
- Shallow-water tint is subtle from boat height; a higher camera shows it more.
- Sail billow is visible up close; at distance a tall ship can still read as one pale panel.
- Saved camera pitch/distance can override the portrait defaults after a refresh.
