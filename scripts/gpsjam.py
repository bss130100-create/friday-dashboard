"""Download yesterday's GPS interference data from gpsjam.org and save the hotspots
as a small JSON file the dashboard can read (data/gpsjam.json), with a count per hot zone.

    python gpsjam.py data/gpsjam.json                  # daily: latest day
    python gpsjam.py --history 120 data/gnss-backfill.json   # once: per-zone counts of past days

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

# Known hot zones, checked in order (first match wins): (name, lat_min, lat_max, lon_min, lon_max).
# The dashboard and the history database both use these counts, so this is the only copy.
REGIONS = [
    ("Baltic / Kaliningrad", 53, 61, 12, 30),
    ("Finnmark / Kola", 66, 72, 20, 45),
    ("Ukraine & neighbours", 43, 53, 20, 41),
    ("Turkey / Anatolia", 36, 43, 26, 41),
    ("Caucasus / Caspian", 38, 48, 41, 55),
    ("Eastern Mediterranean", 30, 37.5, 28, 37),
    ("Middle East / Gulf", 23, 38, 37, 62),
    ("Red Sea / Horn of Africa", 5, 23, 32, 52),
    ("Pakistan / India border", 26, 38, 64, 80),
    ("Myanmar", 10, 28, 92, 102),
    ("Western Russia", 50, 66, 30, 60),
    ("Siberia / Mongolia", 42, 60, 85, 120),
    ("Korean Peninsula", 33, 43, 124, 132),
]


def classify(good: int, bad: int) -> int:
    """GPSJam colour levels: 0 = low (<2% bad), 1 = medium (2-10%), 2 = high (>10%)."""
    share = bad / (good + bad)
    if share > 0.10:
        return 2
    if share > 0.02:
        return 1
    return 0


def region_of(lat: float, lon: float) -> str:
    for name, la0, la1, lo0, lo1 in REGIONS:
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return name
    return "Elsewhere"


def region_counts(cells: list) -> list:
    """[[lat, lon, level], ...] -> [{"name", "high", "medium"}, ...], most high cells first."""
    counts = {}
    for lat, lon, level in cells:
        c = counts.setdefault(region_of(lat, lon), {"high": 0, "medium": 0})
        c["high" if level == 2 else "medium"] += 1
    rows = [{"name": name, **c} for name, c in counts.items()]
    return sorted(rows, key=lambda r: (-r["high"], -r["medium"], r["name"]))


def dates(manifest_csv: str) -> list:
    """manifest.csv rows look like '2026-10-23,false,612,merged'. Oldest first."""
    rows = [line.split(",")[0] for line in manifest_csv.strip().splitlines() if line[:4].isdigit()]
    if not rows:
        raise ValueError(f"No dates in manifest: {manifest_csv[:100]!r}")
    return rows


def latest_date(manifest_csv: str) -> str:
    return dates(manifest_csv)[-1]


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
    out = {"date": date, "source": "gpsjam.org", "regions": region_counts(cells), "cells": cells}
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{date}: {len(cells)} hotspot cells -> {out_path}")


def history(days: int, out_path: str) -> None:
    """Per-zone counts for the last `days` days: [[date, zone, high, medium], ...] (one-off backfill)."""
    rows = []
    for date in dates(download(f"{BASE}/manifest.csv"))[-days:]:
        for r in region_counts(hotspots(download(f"{BASE}/{date}-h3_4.csv"))):
            rows.append([date, r["name"], r["high"], r["medium"]])
        print(date, flush=True)
    with open(out_path, "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    print(f"{len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    if sys.argv[1] == "--history":
        history(int(sys.argv[2]), sys.argv[3])
    else:
        main(sys.argv[1])
