#!/usr/bin/env python3
"""Rebuild assets/audio from the openly licensed source recordings listed in assets/audio/SOURCES.md.

Needs python3 with numpy, and ffmpeg built with libopus and aac. Downloads go to .build/audio-src
(ignored by git). Every edit is a trim, filter, gain, crossfaded loop seam or layering; see SOURCES.md.

    python3 tools/build-audio.py
"""

import os
import subprocess
import sys
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.build', 'audio-src')
OUT = os.path.join(ROOT, 'assets', 'audio')
RATE = 48000

BSB = 'https://bigsoundbank.com/UPLOAD/ogg/{}.ogg'
WM = 'https://upload.wikimedia.org/wikipedia/commons/'

SOURCES = {
    'sea': BSB.format('0698'),
    'beach': BSB.format('0266'),
    'wind': WM + 'b/be/Joseph_SARDIN_-_Vent.ogg',
    'lowerdeck': BSB.format('0695'),
    'backdeck': BSB.format('0697'),
    'underwater': BSB.format('3430'),
    'song': WM + '1/13/Humpbackwhale2.ogg',
    'gull1': WM + '4/43/Gull_1.ogg',
    'gull2': WM + 'c/c6/Gull_2.ogg',
    'gullw': WM + '9/96/Western_Gull_Golden_Gate_National_Recreation_Area.ogg',
    'gullx': WM + '5/5c/XC707075_-_European_Herring_Gull_-_Larus_argentatus.mp3',
    'horn': BSB.format('0261'),
    'splash1': BSB.format('1519'),
    'splash3': BSB.format('1521'),
    'breath': BSB.format('0287'),
    'steam': BSB.format('0227'),
}


def fetch(name: str) -> str:
    url = SOURCES[name]
    path = os.path.join(CACHE, name + os.path.splitext(url)[1])
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'ejm-calm-audio-build/1.0'})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def load(name: str, filters: str = '', rate: int = RATE) -> np.ndarray:
    """Decode to mono float32 at `rate`, optionally through an ffmpeg filter chain."""
    chain = 'aformat=channel_layouts=mono' + (',' + filters if filters else '') + f',aresample={rate}'
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', fetch(name), '-af', chain, '-f', 'f32le', '-ac', '1', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def cut(x: np.ndarray, start: float, length: float) -> np.ndarray:
    a = int(start * RATE)
    return x[a:a + int(length * RATE)].copy()


def fade(x: np.ndarray, fin: float = 0.01, fout: float = 0.05) -> np.ndarray:
    n_in, n_out = int(fin * RATE), int(fout * RATE)
    if n_in:
        x[:n_in] *= np.sin(np.linspace(0, np.pi / 2, n_in)) ** 2
    if n_out:
        x[-n_out:] *= np.cos(np.linspace(0, np.pi / 2, n_out)) ** 2
    return x


def loop(x: np.ndarray, start: float, length: float, cross: float) -> np.ndarray:
    """Seamless loop: the tail past `length` is equal-power crossfaded into the head."""
    seg = cut(x, start, length + cross)
    n, c = int(length * RATE), int(cross * RATE)
    t = np.linspace(0, np.pi / 2, c)
    out = seg[:n].copy()
    out[:c] = seg[:c] * np.sin(t) + seg[n:n + c] * np.cos(t)
    return out


def rms_to(x: np.ndarray, db: float, peak_db: float = -1.0) -> np.ndarray:
    rms = np.sqrt(np.mean(x ** 2)) or 1.0
    y = x * (10 ** (db / 20) / rms)
    peak = np.max(np.abs(y)) or 1.0
    limit = 10 ** (peak_db / 20)
    return y * min(1.0, limit / peak)


def peak_to(x: np.ndarray, db: float) -> np.ndarray:
    return x * (10 ** (db / 20) / (np.max(np.abs(x)) or 1.0))


def gap(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * RATE))


def write(name: str, x: np.ndarray) -> None:
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    base = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-map_metadata', '-1']
    subprocess.run(base + ['-c:a', 'libopus', '-b:a', '40k', '-vbr', 'on', '-application', 'audio', os.path.join(OUT, name + '.ogg')], input=pcm, check=True)
    subprocess.run(base + ['-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart', os.path.join(OUT, name + '.m4a')], input=pcm, check=True)
    print(f'{name}: {len(x) / RATE:.2f}s')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    write('ocean', rms_to(loop(load('sea', 'highpass=f=40'), 30, 30, 3), -20))
    write('surf', rms_to(loop(load('beach', 'highpass=f=60'), 2, 24, 2), -20))
    write('wind', rms_to(loop(load('wind', 'highpass=f=80'), 10, 24, 3), -22))
    write('ship-engine', rms_to(loop(load('lowerdeck', 'highpass=f=35,lowpass=f=2400'), 20, 16, 2), -20))
    write('ship-wash', rms_to(loop(load('backdeck', 'highpass=f=250'), 20, 16, 2), -22))
    write('underwater', rms_to(loop(load('underwater', 'highpass=f=30'), 5, 30, 3), -20))
    write('whale-song', rms_to(loop(load('song', 'highpass=f=60'), 0.5, 35, 2), -22, -2))

    # Gull calls packed into one file; offsets mirror GULL_CALLS in src/audio-mix.ts.
    calls = [
        fade(cut(load('gull1', 'highpass=f=500'), 0.0, 3.0), 0.01, 0.2),
        fade(cut(load('gull1', 'highpass=f=500'), 5.0, 4.5), 0.05, 0.3),
        fade(cut(load('gullw', 'highpass=f=500'), 0.0, 4.5), 0.01, 0.3),
        fade(cut(load('gullx', 'highpass=f=500'), 0.0, 6.0), 0.02, 0.4),
    ]
    sheet, at = [], 0.0
    for call in calls:
        call = peak_to(call, -3)
        print(f'  gull call at {at:.2f}s for {len(call) / RATE:.2f}s')
        sheet += [call, gap(0.5)]
        at += len(call) / RATE + 0.5
    write('gulls', np.concatenate(sheet))

    write('ship-horn', peak_to(fade(load('horn', 'highpass=f=40'), 0.005, 1.5), -2))

    # Two splashes; offsets mirror SPLASH_HITS in src/audio-mix.ts.
    s1 = peak_to(fade(load('splash1', 'highpass=f=30'), 0.002, 0.5), -2)
    s3 = peak_to(fade(load('splash3', 'highpass=f=30'), 0.002, 0.6), -2)
    print(f'  splash 2 at {len(s1) / RATE + 0.5:.2f}s')
    write('splash', np.concatenate([s1, gap(0.5), s3]))

    # Spout blow: a breath slowed to 0.62x (pitch drops with it) over a short steam burst.
    breath = load('breath', 'asetrate=48000*0.62,aresample=48000,lowpass=f=5000', RATE)
    steam = cut(load('steam', 'highpass=f=150,lowpass=f=4500'), 0.0, 2.6)
    steam *= np.exp(-np.linspace(0, 3.2, len(steam)))
    steam = fade(steam, 0.03, 0.4)
    n = max(len(breath), len(steam))
    blow = np.zeros(n)
    blow[:len(breath)] += peak_to(fade(breath, 0.02, 0.2), -3) * 0.8
    blow[:len(steam)] += peak_to(steam, -3) * 0.55
    write('whale-blow', peak_to(blow, -2))

    total = {ext: sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(ext)) for ext in ('.ogg', '.m4a')}
    print('total', {k: f'{v / 1024:.0f} KiB' for k, v in total.items()})


if __name__ == '__main__':
    sys.exit(main())
