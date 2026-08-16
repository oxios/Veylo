from __future__ import annotations

import unittest

from app.main import _axis_slices, _merge_predictions


class DetectionHelpersTest(unittest.TestCase):
    def test_axis_slices_cover_wide_frame_with_overlap(self) -> None:
        slices = _axis_slices(1920, 3, 0.15)
        self.assertEqual(slices[0][0], 0)
        self.assertEqual(slices[-1][1], 1920)
        self.assertEqual(len(slices), 3)
        self.assertTrue(all(current[1] > following[0] for current, following in zip(slices, slices[1:])))

    def test_merge_removes_same_class_tile_duplicates(self) -> None:
        predictions = [
            {"label": "dining table", "confidence": 0.82, "x1": 100, "y1": 100, "x2": 300, "y2": 260},
            {"label": "dining table", "confidence": 0.61, "x1": 108, "y1": 104, "x2": 298, "y2": 255},
            {"label": "chair", "confidence": 0.74, "x1": 108, "y1": 104, "x2": 298, "y2": 255},
        ]
        merged = _merge_predictions(predictions, 20)
        self.assertEqual(len(merged), 2)
        self.assertEqual([item["label"] for item in merged], ["dining table", "chair"])
        self.assertEqual(merged[0]["confidence"], 0.82)


if __name__ == "__main__":
    unittest.main()
