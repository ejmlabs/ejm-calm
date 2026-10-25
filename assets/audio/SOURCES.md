# Audio sources

Every sound here is built from openly licensed field recordings by `tools/build-audio.py`
(numpy + ffmpeg). Each file ships twice: Opus in Ogg (`.ogg`, 40 kb/s mono) and AAC in MP4
(`.m4a`, 56 kb/s mono) for browsers without Ogg Opus. All are 48 kHz mono.

Common edits: downmix to mono, resample to 48 kHz, trim, high/low-pass filtering, gain
normalisation, short fades. Loops (marked *loop*) are cut with an extra tail that is
equal-power crossfaded into the head, so they repeat without a seam.

BigSoundBank states that its sounds are released under CC0 1.0 (https://bigsoundbank.com/licenses.html).

| Output | Source | Author | Licence | Edits |
|---|---|---|---|---|
| ocean.ogg, ocean.m4a | Sea Waves #0698 — https://bigsoundbank.com/sea-waves-s0698.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | *loop* 30 s from 30 s, 3 s crossfade; high-pass 40 Hz |
| surf.ogg, surf.m4a | Sea Waves #0266 — https://bigsoundbank.com/sea-waves-s0266.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | *loop* 24 s from 2 s, 2 s crossfade; high-pass 60 Hz |
| wind.ogg, wind.m4a | Joseph SARDIN - Vent.ogg — https://commons.wikimedia.org/wiki/File:Joseph_SARDIN_-_Vent.ogg | Joseph Sardin (LaSonotheque.org) | CC0 1.0 | *loop* 24 s from 10 s, 3 s crossfade; high-pass 80 Hz |
| ship-engine.ogg, ship-engine.m4a | Boat - Lower deck in front #0695 — https://bigsoundbank.com/boat-lower-deck-in-front-s0695.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | *loop* 16 s from 20 s, 2 s crossfade; band 35–2400 Hz |
| ship-wash.ogg, ship-wash.m4a | Boat - Back deck #0697 — https://bigsoundbank.com/boat-back-deck-s0697.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | *loop* 16 s from 20 s, 2 s crossfade; high-pass 250 Hz |
| underwater.ogg, underwater.m4a | Underwater #3430 — https://bigsoundbank.com/underwater-s3430.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | *loop* 30 s from 5 s, 3 s crossfade; high-pass 30 Hz |
| whale-song.ogg, whale-song.m4a | Humpbackwhale2.ogg — https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg | Spyrogumas | CC0 1.0 | *loop* 35 s from 0.5 s, 2 s crossfade; high-pass 60 Hz |
| gulls.ogg, gulls.m4a | Gull 1.ogg (herring gull, PDSounds no. 241) — https://commons.wikimedia.org/wiki/File:Gull_1.ogg | avphillips | Public domain | calls at 0–3 s and 5–9.5 s; high-pass 500 Hz; packed at 0 s and 3.5 s |
| gulls.ogg, gulls.m4a | Western Gull, Golden Gate National Recreation Area — https://commons.wikimedia.org/wiki/File:Western_Gull_Golden_Gate_National_Recreation_Area.ogg | US National Park Service | Public domain | 0–4.5 s; high-pass 500 Hz; packed at 8.5 s |
| gulls.ogg, gulls.m4a | XC707075 European Herring Gull — https://commons.wikimedia.org/wiki/File:XC707075_-_European_Herring_Gull_-_Larus_argentatus.mp3 (xeno-canto 707075) | Sonothèque ADVL | CC0 1.0 | 0–6 s; high-pass 500 Hz; packed at 13.5 s |
| ship-horn.ogg, ship-horn.m4a | Ocean Liner Horn #1 #0261 — https://bigsoundbank.com/horn-of-a-ship-1-s0261.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | full take; high-pass 40 Hz; 1.5 s fade-out |
| splash.ogg, splash.m4a | Splash, big #1 #1519 — https://bigsoundbank.com/splash-big-1-s1519.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | full take at 0 s; high-pass 30 Hz |
| splash.ogg, splash.m4a | Splash, big #3 #1521 — https://bigsoundbank.com/splash-big-3-s1521.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | full take at 3.77 s; high-pass 30 Hz |
| whale-blow.ogg, whale-blow.m4a | Breath horse #3 #0287 — https://bigsoundbank.com/breath-horse-3-s0287.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | slowed to 0.62× (pitch down); low-pass 5 kHz; layered with the steam hiss |
| whale-blow.ogg, whale-blow.m4a | Hiss of steam train #1 #0227 — https://bigsoundbank.com/hiss-of-steam-train-1-s0227.html | Joseph Sardin (BigSoundBank) | CC0 1.0 | first 2.6 s; band 150–4500 Hz; exponential decay envelope |
