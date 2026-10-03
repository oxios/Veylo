# VenueFlow processing node (`camera-node`)

A node is a Docker host that processes cameras for the main VenueFlow server. It runs two containers:

- `node-mediamtx` (MediaMTX) pulls every assigned camera (main + substream), records the main stream
  **video only** for 24 hours (`/recordings/c<id>_rec`, fMP4 segments of 10 minutes) and serves playback;
- `camera-node` (this directory) is the agent:
  1. sends a heartbeat every 5 s (`POST /api/node/heartbeat`) with host stats (CPU, RAM, GPU, disk) and the
     state of each camera, and receives its config: assigned cameras with RTSP addresses (only over this
     authenticated API), the hub address;
  2. configures MediaMTX paths through its API and runs one analysis thread per camera: the newest frame of the
     substream → YOLO11s + ByteTrack (~5 fps, CUDA when available) → foot points sampled at 2 Hz and the seconds
     actually analysed are uploaded every 4 s (`POST /api/node/observations`, idempotent);
  3. keeps a WebSocket control channel (`/api/node/ws`): while somebody watches a camera it publishes the
     substream to the main server's MediaMTX hub (`ffmpeg -c copy`, video only) and streams detections;
     commands `probe`, `archive.list`, `archive.clip` (cut, optionally re-encode to H.264 — NVENC on GPU),
     `tables.detect`, `snapshot`;
  4. uploads a fresh main-stream frame every 5 minutes (keyframes only) and table / seating-place suggestions
     (COCO `dining table`, `chair`, `couch`, `bench`, clustered over runs);
  5. processes uploaded video files from the API queue (`/api/node/jobs/*`).

The node opens all connections itself, so it needs no inbound ports. It never sees MongoDB. Metrics (entries,
passers-by, occupancy, tables, heatmaps) are computed by the API from the uploaded tracks and the camera markup.
Faces and identities are not stored; audio is never recorded or relayed.

## Run on a server

```bash
cd deploy/node
cp .env.example .env          # VENUEFLOW_URL and NODE_TOKEN from Адмінка -> Вузли обробки
docker compose up -d --build                                               # CPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build   # NVIDIA GPU
```

The main compose stack runs a local node the same way (token `vfn_local_<LOCAL_NODE_SECRET>`).

Settings (environment): `NODE_DEVICE` (`auto | cpu | cuda`), `LIVE_SAMPLE_FPS` (5), `VIDEO_SAMPLE_FPS` (5),
`YOLO_CONFIDENCE` (0.3), `YOLO_IMAGE_SIZE` (640), `TABLE_CONFIDENCE` (0.2), `TABLE_DETECT_INTERVAL_SEC` (300),
`SNAPSHOT_INTERVAL_SEC` (300), `ARCHIVE_HOURS` (24). On a GPU `YOLO_IMAGE_SIZE` is a lower bound: frames are analysed
at their own width up to 1280 px (a 1280×720 main stream → `imgsz=1280`), so people seen far away or through glass are found.

Tracking: BoT-SORT (config generated at start in `NODE_WORK_DIR`: no camera-motion compensation, ~6 s memory for
people hidden behind someone) with ReID `REID_MODEL_PATH` (`yolo26s-reid.onnx`, ONNX Runtime; empty = off). Clean
frames of a track (not overlapping anyone, ≥ 12 % of the frame tall, conf ≥ 0.45) give its appearance vector and
the best crop (`RECORDINGS_DIR/_shots`, survives restarts, deleted together with the archive). `SAM_MODEL_PATH` (`sam2.1_b.pt`) outlines
furniture for the markup editor; it is loaded on first use. All models are downloaded at image build time.
Measured on a real camera (03.10.2026): yolo11m and 10 fps did not give longer tracks than yolo11s at 5 fps, so the
defaults stay; a different detector is a build argument (`YOLO_MODEL`).

Tests (pure functions of `app/pipeline.py`, no torch needed): `python -m unittest discover tests`.

## License notice

This local development worker installs the Ultralytics package and uses Ultralytics
YOLO11 weights. Ultralytics documents its open-source code and models under the
GNU Affero General Public License v3.0 (AGPL-3.0), with a separate Enterprise License
available for use that does not meet AGPL obligations. Treat this worker as a local
development runtime only until the project's distribution, network-use, and source
availability obligations have been reviewed. Production or proprietary deployment
requires an explicit licensing decision; removing this notice does not remove those
obligations.

Official licensing guidance: https://docs.ultralytics.com/help/contributing/#open-sourcing-your-yolo-project-under-agpl-30
