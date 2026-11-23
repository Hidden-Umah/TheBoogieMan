"""Generate the Boogeyman's background video: slow, dark, smoky nebula (domain-warped noise).

    brain/.venv/bin/python tools/gen_background.py [out.webm] [--seconds 20] [--seed 7]

Writes a seamless loop (plays forward, then backward) as VP9 WebM via ffmpeg.
The app blurs it heavily, so it's rendered small and stays tiny on disk.
"""

from __future__ import annotations

import argparse
import subprocess

import numpy as np

W, H = 384, 216  # render size; upscaled on encode
FPS = 24


class Noise3:
    """Smooth 3D value noise on a periodic lattice."""

    def __init__(self, seed: int, size: int = 64):
        self.size = size
        self.grid = np.random.default_rng(seed).random((size, size, size), dtype=np.float32)

    def __call__(self, x, y, z):
        s = self.size
        xi, yi, zi = np.floor(x).astype(int), np.floor(y).astype(int), np.floor(z).astype(int)
        xf, yf, zf = x - xi, y - yi, z - zi
        u, v, w = (t * t * (3 - 2 * t) for t in (xf, yf, zf))
        g = self.grid
        x0, y0, z0 = xi % s, yi % s, zi % s
        x1, y1, z1 = (x0 + 1) % s, (y0 + 1) % s, (z0 + 1) % s
        c = lambda a, b, d: g[a, b, d]  # noqa: E731
        x00 = c(x0, y0, z0) * (1 - u) + c(x1, y0, z0) * u
        x10 = c(x0, y1, z0) * (1 - u) + c(x1, y1, z0) * u
        x01 = c(x0, y0, z1) * (1 - u) + c(x1, y0, z1) * u
        x11 = c(x0, y1, z1) * (1 - u) + c(x1, y1, z1) * u
        return (x00 * (1 - v) + x10 * v) * (1 - w) + (x01 * (1 - v) + x11 * v) * w


def fbm(n: Noise3, x, y, z, octaves=5):
    total, amp, freq = 0.0, 0.5, 1.0
    for _ in range(octaves):
        total = total + amp * n(x * freq, y * freq, z * freq)
        amp *= 0.5
        freq *= 2.03
    return total


def palette(f, q, r):
    """Black space -> deep navy -> smouldering ember orange, mostly dark."""
    base = np.stack([0.010 + 0.0 * f, 0.012 + 0.0 * f, 0.025 + 0.0 * f], -1)
    navy = np.array([0.035, 0.045, 0.11], np.float32)
    ember = np.array([1.0, 0.26, 0.04], np.float32)
    hot = np.array([1.0, 0.62, 0.30], np.float32)
    smoke = np.clip((f - 0.42) * 2.8, 0, 1)[..., None]
    col = base + navy * smoke * (0.4 + q[..., None])
    glow = np.clip((r - 0.56) * 3.6, 0, 1)[..., None] * smoke
    col = col + ember * glow * 0.5 + hot * glow**3 * 0.45
    vign = 1 - 0.55 * ((np.linspace(-1, 1, W)[None, :] ** 2) * 0.6 + (np.linspace(-1, 1, H)[:, None] ** 2))
    return np.clip(col * vign[..., None], 0, 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default="app/public/bg/background.webm")
    ap.add_argument("--seconds", type=float, default=20)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    n = Noise3(a.seed)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    px, py = xs / H * 2.2, ys / H * 2.2
    frames = int(a.seconds * FPS)

    enc = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-filter_complex", "[0]scale=768:432:flags=bicubic,format=yuv420p,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1[o]",
         "-map", "[o]", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1",
         "-deadline", "good", "-cpu-used", "4", "-an", a.out],
        stdin=subprocess.PIPE,
    )
    for i in range(frames):
        t = i / FPS * 0.07  # slow drift
        q = fbm(n, px + 0.0, py + t, t * 0.6)
        q2 = fbm(n, px + 5.2, py + 1.3 - t * 0.5, t * 0.6 + 3)
        r = fbm(n, px + 3.5 * q + 1.7, py + 3.5 * q2 + 9.2, t * 0.8 + 7)
        f = fbm(n, px + 3.0 * r, py + 3.0 * q, t * 0.5 + 11)
        rgb = (palette(f, q, r) ** (1 / 1.7) * 255).astype(np.uint8)
        enc.stdin.write(rgb.tobytes())  # type: ignore[union-attr]
    enc.stdin.close()  # type: ignore[union-attr]
    enc.wait()
    print(f"wrote {a.out} ({frames * 2 / FPS:.0f}s loop)")


if __name__ == "__main__":
    main()
