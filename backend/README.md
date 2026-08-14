# VenueFlow API

Express 5 + MongoDB/Mongoose backend for VenueFlow. It provides owner login, persistent locations,
floors, zones, draggable floor-plan elements, and PDF-assisted starter layouts. Camera elements are
spatial markers only: this API intentionally has no RTSP/ONVIF connection endpoint.

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

The repository-level Docker Compose setup supplies `MONGO_URI=mongodb://mongo:27017/venueflow` and
starts both services. The backend image runs as a non-root user and has an HTTP health check.

## Authentication

- `POST /api/auth/login` — body `{ "email": "...", "password": "..." }`. Sets the HttpOnly
  `venueflow_token` cookie (`SameSite=Lax`) and returns `{ user }`.
- To build a non-browser API client, send `X-Auth-Mode: bearer` on login; the response additionally
  contains `token`. Send that value later as `Authorization: Bearer <token>`.
- `GET /api/auth/me` — returns `{ user }`.
- `POST /api/auth/logout` — clears the cookie and returns `204`.

Browser calls should use `credentials: "include"`. `COOKIE_SECURE=false` is suitable only for local
HTTP. Use `COOKIE_SECURE=true` behind HTTPS. Every resource endpoint is owner-scoped.

## Response conventions

Resources expose `id` strings; internal `_id`, `__v`, `ownerId`, and password hashes are never
returned. Validation failures use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": "coordinates.lat", "message": "..." }]
  }
}
```

Successful DELETE requests return `204`. List endpoints return a plural top-level key; other CRUD
endpoints return a singular top-level key.

## API

### Health

`GET /api/health` is public. It returns `200` only while Mongoose is connected, otherwise `503`.

### Locations

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/locations` | `{ locations }` |
| POST | `/api/locations` | `{ location, floor }` (creates floor 1) |
| GET | `/api/locations/:id` | `{ location }` |
| PATCH | `/api/locations/:id` | `{ location }` |
| PUT | `/api/locations/:id` | `{ location }`, or `{ location, floor }` with `201` when upserted |
| DELETE | `/api/locations/:id` | `204` and cascades all floor data |

POST and PUT accept the frontend-friendly string `id` (for example `location-1720000000000`). A
location body uses the same core shape as `VenueLocation`:

```json
{
  "id": "promprylad",
  "name": "Promprylad Cafe",
  "city": "Ivano-Frankivsk",
  "address": "23 Ukrainskoi Peremohy St",
  "format": "Coffee shop",
  "timezone": "Europe/Kyiv · UTC+3",
  "capacity": 72,
  "businessHours": "08:00–22:00",
  "coordinates": { "lat": 48.9226, "lng": 24.7111 }
}
```

The response also includes frontend defaults/counters: `floors`, `zones`, `cameras`, `online`,
`readiness`, `status`, `demoSeeded`, `privacyConfigured`, `historyDays`, `planFloors`,
`connectedSources`, `configuredCameras`, `configuredScreens`, and `zoneCameraLinks`. Counters are
server-maintained and ignored if included in a create payload.

### Floors and zones

| Method | Path | Body/result |
| --- | --- | --- |
| GET | `/api/locations/:locationId/floors` | `{ floors }` |
| POST | `/api/locations/:locationId/floors` | optional `{ level, name, canvas }`; `{ floor, location }` |
| GET | `/api/floors/:floorId` | `{ floor }` |
| PATCH | `/api/floors/:floorId` | `{ level?, name?, canvas? }`; `{ floor }` |
| DELETE | `/api/floors/:floorId` | `204`, cascades zones/elements/PDF |
| GET | `/api/floors/:floorId/zones` | `{ zones }` |
| POST | `/api/floors/:floorId/zones` | zone body; `{ zone, location }` |
| GET | `/api/zones/:zoneId` | `{ zone }` |
| PATCH | `/api/zones/:zoneId` | partial zone body; `{ zone }` |
| DELETE | `/api/zones/:zoneId` | `204` |

Zone layout is normalized to percentages, matching the current UI:

```json
{
  "name": "Главный зал",
  "type": "Dining",
  "capacity": 24,
  "coverage": 0,
  "left": 20,
  "top": 18,
  "width": 38,
  "height": 30
}
```

Bounds must remain inside `0..100`; aggregate zone capacity cannot exceed location capacity.

### Plan editor

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/floors/:floorId/plan` | `{ floor, zones, planElements, planPdfUrl, planFileName }` |
| PUT | `/api/floors/:floorId/plan/elements` | replace canvas with `{ elements }`; `{ floor, planElements }` |
| POST | `/api/floors/:floorId/plan/elements` | create one; `{ planElement }` |
| PATCH | `/api/plan-elements/:elementId` | update one; `{ planElement }` |
| DELETE | `/api/plan-elements/:elementId` | `204` |

Bulk save accepts at most 500 elements. Coordinates and sizes are percentages, not pixels:

```json
{
  "elements": [
    {
      "id": "table-1",
      "floor": "1",
      "kind": "table",
      "x": 24,
      "y": 36,
      "width": 6,
      "height": 9,
      "rotation": 0,
      "label": "Стол 1"
    }
  ]
}
```

`kind` is one of `table`, `camera`, `wall`, `door`, or `label`. Optional visual fields are `shape`,
`color`, `zIndex`, `locked`, and `zoneId`. A camera is only a canvas marker and contains no stream
URL.

### PDF import

`POST /api/floors/:floorId/plan/import-pdf` accepts `multipart/form-data` with one file in `plan`
(or `file`). Only a PDF of at most 10 MB is accepted. The API:

1. verifies the `%PDF-` signature and parses at most 10 pages;
2. extracts bounded text/position metadata;
3. creates outer walls plus conservative labels/tables/doors/camera markers inferred from text;
4. creates zero-capacity zone candidates only for recognized room names;
5. replaces earlier `pdf-auto` elements while preserving manual elements;
6. stores the original PDF in a dedicated MongoDB document (under MongoDB's 16 MB limit).

Response:

```json
{
  "location": {},
  "floor": {},
  "zones": [],
  "planElements": [],
  "planFileName": "floor-1.pdf",
  "planPdfUrl": "/api/floors/<floorId>/plan/pdf",
  "importSummary": {
    "pageCount": 1,
    "parsedPageCount": 1,
    "textCharacters": 840,
    "generatedElements": 18,
    "generatedZones": 4,
    "rawPdfStored": true
  }
}
```

The protected `GET /api/floors/:floorId/plan/pdf` streams the stored file as `application/pdf`.
Uploading a new PDF replaces the old PDF and its auto-generated elements for that floor.

## Verification

After installing dependencies:

```bash
npm test
npm run check
```

The codebase uses centralized validation/error handling. PDF buffers never reach logs, and no
endpoint accepts or probes RTSP URLs.
