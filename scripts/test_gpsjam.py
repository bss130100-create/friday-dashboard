import unittest

from gpsjam import classify, hotspots, latest_date, region_counts, region_of


class GpsJamTest(unittest.TestCase):
    def test_classify_levels(self):
        self.assertEqual(classify(100, 1), 0)   # 1% bad
        self.assertEqual(classify(95, 5), 1)    # 5% bad
        self.assertEqual(classify(80, 20), 2)   # 20% bad

    def test_latest_date_is_last_row(self):
        manifest = "date,suspect,num_bad_aircraft_hexes\n2026-10-22,false,593,merged\n2026-10-23,false,612,merged\n"
        self.assertEqual(latest_date(manifest), "2026-10-23")

    def test_latest_date_rejects_garbage(self):
        with self.assertRaises(ValueError):
            latest_date("<html>error</html>")

    def test_hotspots_skip_low_and_sparse_cells(self):
        day = (
            "hex,count_good_aircraft,count_bad_aircraft\n"
            "8400241ffffffff,1,1\n"      # only 2 aircraft: skipped
            "8400511ffffffff,99,1\n"     # 1% bad: low, skipped
            "8400535ffffffff,5,5\n"      # 50% bad: high
        )
        cells = hotspots(day)
        self.assertEqual(len(cells), 1)
        lat, lon, level = cells[0]
        self.assertEqual(level, 2)
        self.assertTrue(-90 <= lat <= 90 and -180 <= lon <= 180)

    def test_regions(self):
        self.assertEqual(region_of(55, 20), "Baltic / Kaliningrad")
        self.assertEqual(region_of(34.5, 33), "Eastern Mediterranean")
        self.assertEqual(region_of(0, 0), "Elsewhere")

    def test_region_counts_most_high_first(self):
        cells = [[55, 20, 2], [56, 21, 2], [57, 22, 1], [34.5, 33, 2], [10, 10, 1]]
        self.assertEqual(region_counts(cells), [
            {"name": "Baltic / Kaliningrad", "high": 2, "medium": 1},
            {"name": "Eastern Mediterranean", "high": 1, "medium": 0},
            {"name": "Elsewhere", "high": 0, "medium": 1},
        ])


if __name__ == "__main__":
    unittest.main()
