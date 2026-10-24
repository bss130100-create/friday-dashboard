"""Download yesterday's GPS interference data from gpsjam.org and save the hotspots
as a small JSON file the dashboard can read (data/gpsjam.json).

Why a script and not the browser: gpsjam.org sends no CORS header, and its cells are
H3 hexagon IDs that need the `h3` library to turn into latitude/longitude.
Runs once a day in GitHub Actions (.github/workflows/gpsjam.yml).

How GPSJam works: airliners broadcast their GPS position and its accuracy (ADS-B).
For each hexagon, count aircraft reporting good vs. degraded accuracy. Many "bad"
aircraft in one place means GPS jamming or spoofing there.
"""
import csv
import gzip
import io
import json
import sys
import urllib.request

import h3

BASE = "https://gpsjam.org/data"
MIN_AIRCRAFT = 3  # ignore hexagons seen by only 1-2 aircraft: too noisy


def classify(good: int, bad: int) -> int:
    """GPSJam colour levels: 0 = low (<2% bad), 1 = medium (2-10%), 2 = high (>10%)."""
    share = bad / (good + bad)
    if share > 0.10:
        return 2
    if share > 0.02:
        return 1
    return 0


def latest_date(manifest_csv: str) -> str:
    """manifest.csv rows look like '2026-10-23,false,612,merged'; the last row is the newest day."""
    rows = [line.split(",") for line in manifest_csv.strip().splitlines() if line[:4].isdigit()]
    if not rows:
        raise ValueError(f"No dates in manifest: {manifest_csv[:100]!r}")
    return rows[-1][0]


def hotspots(day_csv: str) -> list:
    """CSV (hex,count_good_aircraft,count_bad_aircraft) -> [[lat, lon, level], ...] for level >= 1."""
    cells = []
    for row in csv.DictReader(io.StringIO(day_csv)):
        good, bad = int(row["count_good_aircraft"]), int(row["count_bad_aircraft"])
        if good + bad < MIN_AIRCRAFT:
            continue
        level = classify(good, bad)
        if level:
            lat, lon = h3.cell_to_latlng(row["hex"])
            cells.append([round(lat, 2), round(lon, 2), level])
    return cells


def download(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as resp:  # raises on HTTP errors
        body = resp.read()
    return (gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body).decode("utf-8")


def main(out_path: str) -> None:
    date = latest_date(download(f"{BASE}/manifest.csv"))
    cells = hotspots(download(f"{BASE}/{date}-h3_4.csv"))
    with open(out_path, "w") as f:
        json.dump({"date": date, "source": "gpsjam.org", "cells": cells}, f, separators=(",", ":"))
    print(f"{date}: {len(cells)} hotspot cells -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
