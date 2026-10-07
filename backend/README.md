# VenueFlow API

Express 5 + MongoDB/Mongoose backend for VenueFlow: owner login, venues, cameras (live RTSP or
uploaded files) with frame markup, processing nodes, live analytics, a 24 h archive proxy, and metrics
computed from person tracks produced by `camera-node`. The previous prototype API (locations, floors,
plan editor, PDF import, camera vision) is archived on the git branch `old`.

Architecture of live cameras: see `docs/TZ_Live_Cameras_RU.md`. In short, processing nodes
(`camera-node` + their own MediaMTX) pull cameras, record 24 h locally and run YOLO; they talk to this
API only (HTTPS + WebSocket with a node token) and publish live video to the MediaMTX hub of the main
server while somebody watches. MongoDB is never exposed to nodes.

## Run locally

Prerequisites: Node.js 20+ and MongoDB 7+.

```bash
cd backend
cp .env.example .env
# Replace JWT_SECRET and SEED_OWNER_PASSWORD in .env
npm install
npm run dev
```

Startup connects to MongoDB and idempotently creates/verifies the base owner when
`AUTO_SEED_OWNER=true`. The plaintext password comes only from `SEED_OWNER_PASSWORD`; MongoDB stores
its bcrypt hash. To seed separately, run `npm run seed`.

Uploaded videos, snapshots and archive clips are stored in `VIDEO_STORAGE_DIR` (Docker: the
`video_data` volume at `/data/videos`; locally: `./storage/videos`). Nodes download upload jobs through
the node API. Without an online node uploads stay `queued`.

## Authentication

- `POST /api/auth/login` — body `{ "email": "...", "password": "..." }`. Sets the HttpOnly
  `venueflow_token` cookie (`SameSite=Lax`) and returns `{ user }`.
- To build a non-browser API client, send `X-Auth-Mode: bearer` on login; the response additionally
  contains `token`. Send that value later as `Authorization: Bearer <token>`.
- `GET /api/auth/me` — returns `{ user }`.
- `POST /api/auth/logout` — clears the cookie and returns `204`.

Browser calls should use `credentials: "include"`. `COOKIE_SECURE=false` is suitable only for local
HTTP. Use `COOKIE_SECURE=true` behind HTTPS. Every resource endpoint is owner-scoped: another
owner's resource responds `404`, never `403`.

## Response conventions

Resources expose `id` strings; internal `_id`, `__v`, `ownerId`, password hashes and storage keys
are never returned. Validation failures use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": "entryLine.a.x", "message": "..." }]
  }
}
```

Successful DELETE requests return `204`, creation returns `201`. List endpoints return a plural
top-level key; other endpoints return a singular top-level key.

## API

### Health

`GET /api/health` is public. It returns `200` only while Mongoose is connected, otherwise `503`.

### Venues

- `GET /api/venues` → `{ venues }`
- `POST /api/venues` — `{ name (2–120), address? (≤240), timezone? (IANA, default Europe/Kyiv) }` → `201 { venue }`
- `PATCH /api/venues/:venueId` — any of `name`, `address`, `timezone` → `{ venue }`
- `DELETE /api/venues/:venueId` → `204`; deletes its cameras, videos, tracks and stored files
- `GET /api/venues/:venueId/cameras` → `{ cameras }`; each camera has a computed `status`
  (`upload | disabled | pending | node_offline | connecting | online | error`, plus `fps`, `width`,
  `height`, `codec`, `mainCodec`, `recording`, `archiveFrom`, `error`, `nodeName`).
- `POST /api/venues/:venueId/cameras` — `{ source: "upload", name, kind? }` or
  `{ source: "rtsp", name, kind: "indoor" | "outdoor" | "hybrid", rtsp: { url, username?, password?, subUrl? } }`
  → `201 { camera }`. Credentials may also be embedded in `url`; they are split off and the full
  address is sealed with AES-256-GCM (`CAMERA_SECRET_KEY`). Responses contain only `rtspDisplay`,
  `rtspSubDisplay` and `rtspUsername`, never the password. A new RTSP camera is assigned to the least
  loaded online node (`nodeId`), otherwise it waits (`status.state = "pending"`). Hybrid and outdoor RTSP
  cameras start with `analysisStream: "main"` (distant people are too small in the sub stream), indoor ones with `"sub"`.
- `GET /api/venues/:venueId/videos` → `{ videos }` (newest first, max 200)

### Cameras and markup

Markup coordinates are fractions of the video frame (`0..1`), independent of resolution.

- `POST /api/cameras/probe` — `{ rtsp: { url, username?, password?, subUrl? } }` → `{ probe: { node, main, sub, frame } }`;
  an online node opens the streams (`main`/`sub`: `{ ok, codec, width, height, fps }` or
  `{ ok: false, errorCode: auth | not_found | refused | timeout | dns | codec | unknown, error }`),
  `frame` is a JPEG data URI. `503 NO_NODE` without an online node, `504` when the camera is silent.
- `POST /api/cameras/:cameraId/probe` → same, with the stored address.
- `PATCH /api/cameras/:cameraId` — any of:
  - `name`, `kind`, `enabled`, `analysisStream` (`sub | main`);
  - `rtsp` `{ url, username, password, subUrl }` — an empty `password` keeps the stored one;
  - `streetZone` (outdoor), `doorZone` (hybrid): `{ points } | null`;
  - `staffZone` (behind the counter: people there are staff, not guests in the hall) and `queueZone`
    (in front of the counter) for indoor/hybrid cameras: `{ points } | null`;
  - `tables`: `[{ id ([A-Za-z0-9_-]{1,24}), label (1–40), points (3–32) }]` (≤ 40, unique ids);
  - `entryLine`: `{ a: {x,y}, b: {x,y}, inside: "positive" | "negative" } | null`. `inside` is the
    sign of `cross(b − a, p − a)` for points inside the venue; the line must be ≥ 0.02 long;
  - `hallZone`: `{ points: [{x,y}] (3–24) } | null`.
  Any markup or `kind` change increments `markupVersion`; for live cameras every stored hour of the
  last `LIVE_TRACK_RETENTION_DAYS` is recomputed in the background (`GET /api/cameras/:id/recompute`
  → `{ recompute: { pendingHours, totalHours, markupVersion } }`, pending = hours still computed with an older markup).
- `DELETE /api/cameras/:cameraId` → `204`; deletes its videos, tracks, live tracks, hourly
  aggregates and files. The node drops the camera and its recordings.
- `GET /api/cameras/:cameraId/snapshot` → `image/jpeg`: the latest frame uploaded by the node (live) or
  of the latest processed video (`404 SNAPSHOT_NOT_FOUND` before the first one).
- `POST /api/cameras/:cameraId/segment` — `{ x, y }` (a click on the frame) → `{ outline: { points (3–32), score } }`:
  the node grabs a main-stream frame and outlines the object under the click with SAM 2 (furniture → table zone).
  `422 NOTHING_FOUND`, `502 SEGMENT_FAILED` (e.g. SAM 2 not installed on the node), up to ~90 s on first use.
- `POST /api/cameras/:cameraId/tables/detect` → `202`; the node looks for `dining table` on a fresh
  main-stream frame. Candidates appear in `camera.tableSuggestions` (`{x1,y1,x2,y2,score,hits}`); only
  tables confirmed into `tables` are measured.
- `GET /api/cameras/:cameraId/metrics` → `{ metrics }`, `null` without a processed video:
  - `period {from,to}`, `videos[]`, `trackCount`, `markup {entryLine, hallZone}`;
  - `entries {total, exits}` — crossings of the entry line (0.015 hysteresis), `null` without a line;
  - `occupancy {peak, peakAt, average}` and `dwell {averageSec, medianSec, tracks, minSec}` —
    people whose foot point is inside the hall zone; `null` without a zone. Stays shorter than 3 s and
    gaps longer than 2 s inside a track are not counted;
  - `series {bucketSeconds, buckets[{start, coveredSec, entries, exits, occupancyAvg, occupancyMax}]}` —
    bucket size adapts to the span (10 s … 1 day, ≤ 36 buckets); values are `null` where no video
    covers the bucket or the markup is missing;
  - `heatmap {cols, rows, cells}` — person-seconds per frame cell.

Metrics of uploaded videos are recomputed from stored tracks on every request, so changing the markup
never requires reprocessing.

### Live cameras

Live metrics come from hourly aggregates (`camerahours`, kept forever) computed from live tracks
(`livetracks`, TTL `LIVE_TRACK_RETENTION_DAYS`, default 7). Seconds the camera was actually analysed
are stored separately: a period without coverage is a gap (`null`), never a zero.

- `GET /api/cameras/:cameraId/stats?period=today|yesterday|7d|30d` → `{ stats }` (day boundaries in
  the venue time zone): `coverage {coveredSec, spanSec}`, `entries {total, exits}` (outdoor/hybrid with
  a door line), `passersby {total, conversion}` (needs the line and the street zone / door opening;
  conversion = entries / (entries + passers-by)), `occupancy {peak, peakAt, average}` and `dwell`
  (indoor/hybrid; hall = hall zone or the whole frame, minus the door opening), `tables {items[{id,
  label, occupiedSec, rate, sessions, avgSessionSec}], averageRate, avgSessionSec}`, `series {bucket:
  hour|day, buckets[{start, future, coveredSec, entries, exits, passersby, occupancyAvg, occupancyMax,
  tableRate}]}`, `tableGrid`, `profile` (24 hour-of-day rows for 7d/30d), `heatmap`, `markupStaleBefore`.
  Rules: line crossings with 0.015 hysteresis; a passer-by is a finished track that was in the zone (for
  hybrid ≥ 60 % of its points in the door opening) and never crossed the line; a table is occupied in
  sessions ≥ 60 s (gaps < 30 s merged) by foot points inside the table polygon expanded ×1.35.
- `GET /api/cameras/:cameraId/now` → `{ live: { status, at, now: { people, inHall (guests on live tracks + people not numbered yet, outside the doorway and staff zone; staff are
  not counted), outside, elsewhere (staff zone), staffInHall, hidden (entered guests out of sight beyond the unnumbered), tables[{id,
  occupied, sinceSec}] } | null, today: { entries, exits, passersby } } }`.
- `GET /api/cameras/:cameraId/live/stream` — Server-Sent Events: `frame` `{ t, session, people: [[trackId, x1, y1,
  x2, y2, conf]], labels? }` (~5/s) and `state` (same as `/now`, every 2 s). `labels` maps a trackId to the person
  of the day: `{ p (personId), no, role: guest | staff, since (visit start, ms), review, name?, color? }`. An open stream makes the node publish
  the live video and detections; without viewers it stops after ≤ 45 s.
- `POST /api/cameras/:cameraId/live/whep` (body `application/sdp`) → `201` SDP answer with
  `Location: /api/cameras/:id/live/whep/:session`; `PATCH`/`DELETE` that location. WHEP is proxied to the
  MediaMTX hub; media flows over WebRTC (UDP/TCP 8189). `504 LIVE_NOT_READY` if the node did not start
  publishing within 15 s.
- `GET /api/cameras/:cameraId/archive` → `{ archive: { from, to, segments[{start, duration}], activity
  [[minuteMs, avgPeople, entries, passersby]], error } }` for the last 24 h (segments come from the node).
- `POST /api/cameras/:cameraId/archive/clips` — `{ start (ISO), durationSec (5–600), codec: copy | h264 }`
  → `202 { clip }`; the node cuts the range (video only) and uploads an MP4 (`h264` re-encodes HEVC for
  browsers without HEVC). `GET …/clips/:clipId` → `{ clip: { status: pending | ready | failed, error,
  sizeBytes } }`; `GET …/clips/:clipId/file` → `video/mp4` with range support. Clips live 30 minutes.

### Videos

- `POST /api/cameras/:cameraId/videos` — `multipart/form-data` with `file` and `recordedAt`
  (ISO date, not in the future). The container is detected from magic bytes (MP4, MOV, AVI, MKV;
  anything else → `415 UNSUPPORTED_VIDEO`); size limit `VIDEO_MAX_UPLOAD_BYTES` (default 2 GiB,
  `413`). → `201 { video }` with `status: "queued"`.
- `GET /api/videos/:videoId` → `{ video }`: `status` (`queued | processing | done | failed`),
  `progress` (0..1), `error`, and after processing `durationSec`, `sampleFps`, `trackCount`, `model`,
  `sourceDeleted`.
- `GET /api/videos/:videoId/snapshot` → `image/jpeg`.
- `DELETE /api/videos/:videoId` → `204`; the worker abandons a video deleted mid-processing.

### Guests and staff

People of the day are built from live tracks of indoor/hybrid cameras. A track becomes "Гість №N" (numbers restart
every venue-local day) only after crossing the entry line inward (cameras without a line: 30 s in the hall; someone
30 s in the hall while no entered person is out of sight gets a number with `enteredBy: "unseen"`); 60 s in
the staff zone makes a "who is this?" review instead. A hall track without an entry continues someone already
inside: the track that vanished there (≤ 20 s nearby, ≤ 3 min on the same spot), the same appearance, or a guest who
entered and is out of sight (`hidden` in `/now`: open visits not on any visible track, added to "in the hall"). Nodes with ReID send an appearance vector per track (clothes/silhouette, no face, no image); a new
track whose vector matches a person of the same day (cosine ≥ 0.80 with a 0.05 margin over the runner-up, not on
another track at the same time; compared with the closest of up to 16 vectors the person collected during the day
from different tracks — a per-day gallery) continues that person — a lost-and-found track within 3 min continues the visit,
otherwise it is a new visit. Vectors are never returned to the browser and are erased after the day ends
(+2 h). A visit closes on an exit through the door or 3 min without the person.

- `GET /api/venues/:venueId/guests?day=YYYY-MM-DD` (default today, venue time zone) → `{ guests: { day, today,
  timezone, live, from, to, cameras[], kpis { guests, visits, returning, avgVisitSec, medianVisitSec, inHallNow,
  activeVisits, passersby, conversion, lastWeekGuests (same weekday a week ago, null without data), reviews },
  occupancy[{t, avg}] (10 min), gaps[{from, to}] (≥ 10 min without analysis), persons[], visits[{ …, path[[t, x, y]]
  (≤ 60 points) }], passers: null | { pedestrians, cyclists, byHour[{hour, pedestrians, cyclists}], items[{ id (track),
  cameraId, at, from, to, kind: pedestrian | cyclist, hasShot }] (newest first, ≤ 300) } } }`. A passer-by is a complete
  track in the door opening / on the sidewalk that never crossed the threshold, moved ≥ 0.025 of the frame and was
  detected with confidence ≥ 0.45 at least once (tracks from older nodes carry no confidence); a person
  on a bicycle (or a bicycle whose rider was not detected) is a cyclist, a rider and his bicycle count once.
- `GET /api/tracks/:trackId/thumb` → `image/jpeg`: the best frame of a passer-by track (same storage rules as below).
  Guests waiting for a staff confirmation are not counted as guests.
- `GET /api/venues/:venueId/staff-day?day=` → `{ staffDay: { day, live, zones {staff, queue, camera},
  shifts[{ staff, personIds, shift | null }], reviews[] (people waiting for "who is this?"), waiting } }`.
  `shift` = `{ firstSeenAt, lastSeenAt, onSiteSec, counterSec, hallSec, exits, longestAbsenceSec,
  segments[{from, to, where: counter | hall | frame}], absences[{from, to, sec}] (> 60 s out of frame), state,
  stateSince }` (epoch seconds). `waiting` (`null` without both staff and queue zones) = `{ episodes[{from, to,
  sec, cameraId}], totalSec }`: a guest in the queue zone while nobody is in the staff zone (≥ 10 s).
- `GET /api/venues/:venueId/people/summary` → `{ summary: { day, reviews } }` (badge in the menu).
- `GET|POST /api/venues/:venueId/staff`, `PATCH /api/staff/:staffId` — `{ name (1–60), role: barista | waiter |
  cook | admin | other, color: violet | teal | amber | rose | sky | lime | indigo | brown, active }`. No photos.
- `GET /api/staff/:staffId/history` → `{ history[{ day, onSiteSec, visits }] }` for the last 7 days.
- `GET /api/persons/:personId` → `{ person: { …, visits[{ …, path[[t, x, y]] (≤ 240 points) }] } }`.
- `GET /api/persons/:personId/thumb` → `image/jpeg`: the person's best frame, kept on the node no longer than
  its archive (`/recordings/_shots` on the node; `404 THUMB_NOT_AVAILABLE` after that, `503` when the node is offline).
  Never stored by the API.
- `POST /api/persons/:personId/role` — exactly one of `{ role: "guest" }`, `{ staffId }`, `{ newStaff: { name,
  role?, color? } }`. Confirming a staff member makes the node's day vector recognise them for the rest of the day.
  A staff member is one human per day: another person of the day already marked as the same staff member goes back
  to the guests when the camera saw both at the same time in different places (≥ 2 s, > 0.15 apart), otherwise it is
  merged into this person. → `{ person, merged: [{ id, no }], demoted: [{ id, no }] }`.
- `POST /api/persons/:personId/merge` — `{ intoPersonId }` (same venue and day): visits and tracks move over.
  `409 PEOPLE_SEEN_APART` when the camera saw both at the same time in different places.
- `POST /api/visits/:visitId/detach` → the visit gets a new number ("these are different people").

### Processing

- `GET /api/processing/status` → `{ worker: { online, lastSeenAt, model, nodes } }`; `online` is true
  while at least one enabled node sent a heartbeat within `NODE_STALE_AFTER_MS` (default 20 s).

### Administration (users with `isAdmin`; others get `404`)

- `GET /api/admin/nodes` → `{ nodes }` with `online`, `connected`, `cameraCount`, `info` (host, device,
  GPU, model) and `stats` (CPU, RAM, GPU, disk, fps, uptime).
- `POST /api/admin/nodes` — `{ name, maxCameras? (1–64) }` → `201 { node, token, setup }`. The token
  `vfn_<slug>_<secret>` is shown once; only sha256(secret) is stored.
- `PATCH /api/admin/nodes/:nodeId` — `name`, `enabled`, `maxCameras`. Disabling closes its channel.
- `POST /api/admin/nodes/:nodeId/token` → `{ token, setup }` (rotation; not for the env-managed local node).
- `DELETE /api/admin/nodes/:nodeId` → `204`; its cameras return to "pending" and are reassigned.
- `GET /api/admin/cameras` → `{ cameras }` (all owners); `PATCH /api/admin/cameras/:cameraId`
  `{ nodeId | null }` moves a camera.

### Node API (bearer node token; used by `camera-node` only)

- `POST /api/node/heartbeat` — `{ version, info, stats, cameras[{id, state, error, errorCode, fps, …}] }`
  → `{ config: { revision, cameras[{id, name, kind, enabled, main, sub, analysis, hubPath}], hub: { rtspUrl } } }`.
  The config is the only place where decrypted RTSP addresses leave the API.
- `GET /api/node/ws` (WebSocket) — commands `config`, `watch {cameraId, ttlSec}`, `probe`,
  `archive.list`, `archive.clip`, `archive.frame {ref}` (→ `{ jpeg }` base64 person crop), `segment
  {cameraId, x, y}` (→ `{ points, score }`, SAM 2), `tables.detect`, `snapshot`; the node sends `reply` and
  `frame {cameraId, session, t, people}`.
- `POST /api/node/observations` — `{ cameraId, coverage[{minute, seconds}], tracks[{key, startAt,
  endAt, from, points[[offsetSec, x, y]], final, feat?, featN?, shot?, cls?, bike?}], now? }` (idempotent: coverage uses `$max`, points are
  appended only when `from` matches the stored count). `feat` = L2-normalised mean ReID embedding of the track's
  clean frames (64–1024 values), `featN` = frames in it, `shot` = `{ at (ms), box [x1,y1,x2,y2], score, ref }` — the
  best frame, whose crop the node keeps under `ref` (`<session>_<trackId>`); `conf` = the best detection confidence (passers-by need ≥ 0.45), `cls: "bicycle"` marks bicycle tracks (only
  passer-by counts use them), `bike: true` a person riding a bicycle. Frames carry bicycles as `[id, x1, y1, x2, y2, conf, 1]` and people held behind an obstacle (the detector lost them in the
  middle of the room, the node keeps matching the visible part of their last view) as `[id, x1, y1, x2, y2, score, 2]`.
  Heartbeat config cameras carry `noHold { zones, line }` (doorway/sidewalk polygons and the threshold) where nobody is held. The reply comes after the batch's
  tracks were assigned to people. `409 CAMERA_NOT_ASSIGNED` for foreign cameras.
- `POST /api/node/cameras/:id/snapshot` (`image/jpeg`), `POST /api/node/cameras/:id/tables`.
- `POST /api/node/clips/:clipId` (MP4 body), `POST /api/node/clips/:clipId/fail`.
- Upload queue: `POST /jobs/claim`, `GET /jobs/:id/source`, `POST /jobs/:id/progress | snapshot |
  result | fail` (a job without progress for 2 minutes is requeued).
- `POST /api/internal/mediamtx/auth?secret=MEDIAMTX_SECRET` — MediaMTX hub hook: a node may publish
  `cam_<id>` only for its own cameras; only the API's WHEP proxy may read.

## Verification

After installing dependencies:

```bash
npm test
npm run check
```

The codebase uses centralized validation/error handling. Video bytes and RTSP credentials never reach
logs or browser responses, storage paths are server-generated and path-guarded. RTSP is supported for
live cameras (decision of 02.10.2026); ONVIF discovery is not implemented.
