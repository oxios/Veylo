import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.pipeline import (
    appearance_quality,
    drop_duplicates,
    rides_bicycle,
    shot_quality,
    inference_size,
    CoverageCounter,
    LiveTrackBook,
    TableClusterer,
    TrackCollector,
    classify_rtsp_error,
    foot_point,
    frame_step,
    mask_url,
    mediamtx_paths,
    normalized_box,
    normalized_fps,
    path_names,
    recording_start,
    storage_path,
)

CAMERA = "5f2b6c1d9e8a7b6c5d4e3f21"


class PipelineTest(unittest.TestCase):
    def test_frame_step_samples_about_the_requested_rate(self):
        self.assertEqual(frame_step(25, 5), 5)
        self.assertEqual(frame_step(30, 5), 6)
        self.assertEqual(frame_step(4, 5), 1)

    def test_invalid_fps_falls_back(self):
        for raw in (0, -1, float("nan"), 1000):
            self.assertEqual(normalized_fps(raw), 25.0)
        self.assertEqual(normalized_fps(29.97), 29.97)

    def test_foot_point_is_bottom_centre_clamped(self):
        self.assertEqual(foot_point([100, 50, 300, 400], 1000, 500), (0.2, 0.8))
        self.assertEqual(foot_point([-50, 0, 10, 900], 1000, 500), (0.0, 1.0))
        self.assertEqual(normalized_box([100, 50, 300, 600], 1000, 500), [0.1, 0.1, 0.3, 1.0])

    def test_short_tracks_are_dropped(self):
        collector = TrackCollector(min_points=3)
        for t in range(3):
            collector.add(7, t / 5, 0.5, 0.5)
        collector.add(8, 0, 0.1, 0.1)
        self.assertEqual([track["trackId"] for track in collector.finalize()], [7])
        self.assertEqual(collector.finalize()[0]["points"][1], [0.2, 0.5, 0.5])

    def test_storage_path_rejects_foreign_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            key = f"{uuid.uuid4()}.mp4"
            self.assertEqual(storage_path(base, key), (base / key).resolve())
            for bad in ("../x.mp4", "x.mp4", f"{key}/../y.mp4", "", None):
                with self.assertRaises(ValueError):
                    storage_path(base, bad)


class LiveTrackBookTest(unittest.TestCase):
    def test_points_are_sampled_and_uploaded_incrementally(self):
        book = LiveTrackBook("s1", point_interval=0.5, lost_after=3, min_points=3, dense_start=0)
        for i in range(5):  # 5 fps for 1 s -> points at 0, 0.6 (>=0.5 apart)
            book.observe(1000 + i * 0.2, [(4, 0.5, 0.5)])
        self.assertEqual(book.drain(), [], "two points are not a track yet")
        book.observe(1001.2, [(4, 0.6, 0.5)])
        first = book.drain()
        self.assertEqual(len(first), 1)
        self.assertEqual(first[0]["key"], "s1:4")
        self.assertEqual(first[0]["from"], 0)
        self.assertEqual([p[0] for p in first[0]["points"]], [0, 0.6, 1.2])
        self.assertEqual(first[0]["startAt"], 1_000_000)
        book.observe(1001.8, [(4, 0.7, 0.5)])
        second = book.drain()
        self.assertEqual(second[0]["from"], 3)
        self.assertEqual(second[0]["points"], [[1.8, 0.7, 0.5]])
        self.assertFalse(second[0]["final"])

    def test_lost_tracks_are_finalised_once_and_flicker_is_never_sent(self):
        book = LiveTrackBook("s1", point_interval=0.5, lost_after=3, min_points=3, dense_start=0)
        for i in range(4):
            book.observe(10 + i * 0.5, [(1, 0.2, 0.2)])
        book.observe(10, [(2, 0.9, 0.9)])  # one-frame flicker
        book.drain()
        book.expire(20)
        final = book.drain()
        self.assertEqual([(item["key"], item["final"], item["points"]) for item in final], [("s1:1", True, [])])
        self.assertEqual(book.drain(), [])
        self.assertEqual(book.tracks, {})

    def test_a_reused_tracker_id_after_finalisation_starts_a_new_track(self):
        book = LiveTrackBook("s1", min_points=1)
        book.observe(0, [(1, 0.1, 0.1)])
        book.expire(10)
        book.observe(11, [(1, 0.2, 0.2)])
        self.assertEqual(book.tracks[1].start, 11)

    def test_current_positions_skip_unconfirmed_and_stale_tracks(self):
        book = LiveTrackBook("s1", point_interval=0.1, min_points=2)
        book.observe(0, [(1, 0.1, 0.1), (2, 0.5, 0.5)])
        book.observe(0.2, [(1, 0.15, 0.1)])
        self.assertEqual(book.current(0.3), [(1, 0.15, 0.1)])
        self.assertEqual(book.current(5), [])


class CoverageTest(unittest.TestCase):
    def test_distinct_seconds_per_minute(self):
        coverage = CoverageCounter()
        for t in (120.1, 120.5, 121.0, 179.9, 180.0):
            coverage.mark(t)
        self.assertEqual(coverage.report(181), [{"minute": 120_000, "seconds": 3}, {"minute": 180_000, "seconds": 1}])
        self.assertEqual(coverage.report(2000), [], "old minutes are pruned")


class TablesTest(unittest.TestCase):
    def test_stable_boxes_survive_and_one_off_boxes_drop_after_three_runs(self):
        clusterer = TableClusterer()
        table = [0.1, 0.5, 0.3, 0.7]
        clusterer.add_run([(table, 0.6), ([0.7, 0.1, 0.8, 0.2], 0.3)])
        self.assertEqual(len(clusterer.candidates()), 2)
        clusterer.add_run([([0.11, 0.5, 0.31, 0.7], 0.7)])
        clusterer.add_run([([0.1, 0.51, 0.3, 0.71], 0.5)])
        candidates = clusterer.candidates()
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["hits"], 3)
        self.assertEqual(candidates[0]["score"], 0.7)
        self.assertEqual(candidates[0]["kind"], "table")

    def test_tables_and_seats_cluster_separately(self):
        clusterer = TableClusterer()
        box = [0.4, 0.1, 0.5, 0.3]
        clusterer.add_run([(box, 0.7, "seat"), (box, 0.3, "table")])
        self.assertEqual(sorted(candidate["kind"] for candidate in clusterer.candidates()), ["seat", "table"])


class RtspTest(unittest.TestCase):
    def test_error_classification(self):
        self.assertEqual(classify_rtsp_error("method DESCRIBE failed: 401 Unauthorized"), "auth")
        self.assertEqual(classify_rtsp_error("Connection to tcp://1.2.3.4:554 failed: Connection timed out"), "timeout")
        self.assertEqual(classify_rtsp_error("Connection refused"), "refused")
        self.assertEqual(classify_rtsp_error("404 Stream Not Found"), "not_found")
        self.assertEqual(classify_rtsp_error("weird"), "unknown")

    def test_credentials_are_masked(self):
        self.assertEqual(mask_url("open rtsp://admin:secret@1.2.3.4:554/x failed"), "open rtsp://***@1.2.3.4:554/x failed")

    def test_mediamtx_paths_record_video_only_and_pull_both_streams(self):
        paths = mediamtx_paths({"id": CAMERA, "main": "rtsp://a/main", "sub": "rtsp://a/sub"})
        names = path_names(CAMERA)
        self.assertEqual(set(paths), {names["main"], names["rec"], names["sub"]})
        self.assertIn("-map 0:v:0 -c copy", paths[names["main"]]["runOnAvailable"])
        self.assertTrue(paths[names["rec"]]["record"])
        self.assertNotIn(names["sub"], mediamtx_paths({"id": CAMERA, "main": "rtsp://a/main", "sub": ""}))
        with self.assertRaises(ValueError):
            path_names("../etc")

    def test_recording_names(self):
        self.assertEqual(recording_start("2026-10-02_19-30-00-123456.mp4"), datetime(2026, 10, 2, 19, 30, 0, 123456, tzinfo=timezone.utc))
        self.assertIsNone(recording_start("notes.txt"))


if __name__ == "__main__":
    unittest.main()


class InferenceSizeTest(unittest.TestCase):
    def test_gpu_uses_frame_width_up_to_limit(self):
        self.assertEqual(inference_size(1280, 640, gpu=True), 1280)
        self.assertEqual(inference_size(1920, 640, gpu=True), 1280)
        self.assertEqual(inference_size(704, 640, gpu=True), 704)
        self.assertEqual(inference_size(640, 640, gpu=True), 640)
        self.assertEqual(inference_size(352, 640, gpu=True), 640)

    def test_cpu_keeps_configured_size(self):
        self.assertEqual(inference_size(1280, 640, gpu=False), 640)


class PasserbySamplingTest(unittest.TestCase):
    def test_a_sub_second_pass_is_kept(self):
        # 4 analysed frames at 5 fps = 0.6 s in the door glass: kept frame by frame, uploaded with 2+ points.
        book = LiveTrackBook("s1")
        for step in range(4):
            book.observe(10 + step * 0.2, [(5, 0.05 + step * 0.03, 0.3)])
        batch = book.drain()
        self.assertEqual(len(batch), 1)
        self.assertEqual(len(batch[0]["points"]), 4)

    def test_later_points_are_sparse(self):
        book = LiveTrackBook("s1")
        for step in range(50):  # 10 s at 5 fps
            book.observe(10 + step * 0.2, [(5, 0.5, 0.5)])
        points = book.drain()[0]["points"]
        self.assertLess(len(points), 30)


class DuplicateTest(unittest.TestCase):
    def test_tight_and_wide_box_of_one_seated_person_become_one(self):
        # Measured on the real camera: #1 tight, #25 "person + chair", IoU 0.55, containment 1.0.
        kept = drop_duplicates([[25, 0.42, 0.05, 0.53, 0.35, 0.47], [1, 0.47, 0.05, 0.53, 0.35, 0.36]])
        self.assertEqual([box[0] for box in kept], [1])

    def test_two_people_side_by_side_or_one_behind_another_stay(self):
        side = drop_duplicates([[1, 0.40, 0.2, 0.50, 0.6, 0.8], [2, 0.46, 0.2, 0.56, 0.6, 0.8]])
        self.assertEqual(len(side), 2)
        behind = drop_duplicates([[1, 0.30, 0.2, 0.60, 0.9, 0.8], [2, 0.40, 0.25, 0.45, 0.4, 0.6]])
        self.assertEqual(len(behind), 2)


class BicycleTest(unittest.TestCase):
    def test_rider_overlaps_bicycle_with_lower_half(self):
        person = [0.4, 0.2, 0.5, 0.6]
        self.assertTrue(rides_bicycle(person, [[0.38, 0.4, 0.52, 0.62]]))
        self.assertFalse(rides_bicycle(person, [[0.7, 0.4, 0.8, 0.6]]))
        self.assertFalse(rides_bicycle(person, [[0.38, 0.0, 0.52, 0.15]]))  # above the head

    def test_bicycle_tracks_are_uploaded_with_class_and_rider_flag(self):
        book = LiveTrackBook(session="abcdef0123")
        for step in range(3):
            book.observe(10 + step * 0.5, [(1, 0.5, 0.5)])
            book.observe(10 + step * 0.5, [(2, 0.5, 0.52)], kind="bicycle")
            book.mark_bike(1)
        batch = {item["key"]: item for item in book.drain()}
        self.assertEqual(batch["abcdef0123:2"]["cls"], "bicycle")
        self.assertTrue(batch["abcdef0123:1"]["bike"])
        self.assertNotIn("cls", batch["abcdef0123:1"])
        self.assertEqual([item[0] for item in book.current(11)], [1], "bicycles are not people in the hall")

    def test_best_confidence_is_uploaded_when_it_grows(self):
        book = LiveTrackBook(session="abcdef0123")
        for step in range(3):
            book.observe(10 + step * 0.5, [(1, 0.5, 0.5)])
        book.note_conf(1, 0.42)
        book.note_conf(1, 0.81)
        self.assertEqual(book.drain()[0]["conf"], 0.81)
        book.observe(12, [(1, 0.5, 0.5)])
        book.note_conf(1, 0.5)
        self.assertNotIn("conf", book.drain()[0])

    def test_shot_quality_accepts_distant_people(self):
        self.assertGreater(shot_quality([0.1, 0.1, 0.12, 0.16], 0.5), 0)
        self.assertEqual(shot_quality([0.1, 0.1, 0.12, 0.16], 0.2), 0)


class AppearanceTest(unittest.TestCase):
    def test_quality_rejects_small_overlapping_and_weak_boxes(self):
        box = [0.4, 0.2, 0.5, 0.7]
        self.assertGreater(appearance_quality(box, 0.8, []), 0)
        self.assertEqual(appearance_quality([0.4, 0.2, 0.43, 0.28], 0.8, []), 0)  # distant person
        self.assertEqual(appearance_quality(box, 0.3, []), 0)  # weak detection
        self.assertEqual(appearance_quality(box, 0.8, [[0.45, 0.3, 0.6, 0.8]]), 0)  # someone in front
        self.assertGreater(appearance_quality(box, 0.8, [[0.7, 0.2, 0.8, 0.7]]), 0)  # someone far away

    def test_track_vector_and_best_shot_are_uploaded_once(self):
        book = LiveTrackBook(session="abcdef0123", min_feat_samples=2)
        for step in range(4):
            book.observe(100 + step * 0.5, [(7, 0.5, 0.5)])
        self.assertEqual(book.add_appearance(7, [1.0, 0.0], 100.0, [0.4, 0.2, 0.5, 0.7], 0.3), "abcdef0123_7")
        self.assertIsNone(book.add_appearance(7, [0.0, 1.0], 100.5, [0.4, 0.2, 0.5, 0.7], 0.31))  # not clearly better
        first = book.drain()[0]
        self.assertEqual(first["featN"], 2)
        self.assertAlmostEqual(first["feat"][0], 0.7071, places=3)
        self.assertEqual(first["shot"]["ref"], "abcdef0123_7")
        book.observe(102.5, [(7, 0.5, 0.5)])
        second = book.drain()[0]
        self.assertNotIn("feat", second)
        self.assertNotIn("shot", second)
