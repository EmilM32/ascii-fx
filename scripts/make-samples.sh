#!/bin/sh
# Rebuild the bundled NASA stills and the hero loop. Needs network and ffmpeg.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
ua='ascii-fx-samples/0.1 (NASA public domain)'
curl -fsSL -A "$ua" -o "$tmp/aldrin.jpg" "https://upload.wikimedia.org/wikipedia/commons/9/98/Aldrin_Apollo_11_original.jpg"
curl -fsSL -A "$ua" -o "$tmp/earth.jpg" "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg"
out="$root/demo/public/samples"
ffmpeg -y -i "$tmp/aldrin.jpg" -frames:v 1 -update 1 -vf "scale=1400:-2" -q:v 3 "$out/aldrin.jpg"
ffmpeg -y -i "$tmp/earth.jpg" -frames:v 1 -update 1 -vf "scale=1200:-2" -q:v 3 "$out/earth.jpg"
ffmpeg -y -loop 1 -framerate 24 -i "$out/aldrin.jpg" -vf "scale=1200:1200:force_original_aspect_ratio=increase,crop=1200:1200,crop=860:860:x='(in_w-out_w)/2+(in_w-out_w)*0.06*sin(2*PI*t/6)':y='(in_h-out_h)*0.34+(in_h-out_h)*0.04*sin(2*PI*t/6)',scale=720:720:flags=lanczos,format=yuv420p" -t 6 -r 24 -an -c:v libx264 -preset slow -crf 22 -movflags +faststart "$out/hero.mp4"
rm -rf "$tmp"
