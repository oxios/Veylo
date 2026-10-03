export type Point = { x: number; y: number };

export type EntryLine = { a: Point; b: Point; inside: "positive" | "negative" };

export type Zone = { points: Point[] };
export type HallZone = Zone;

export type Table = { id: string; label: string; points: Point[] };

export type TableSuggestion = { x1: number; y1: number; x2: number; y2: number; score: number; hits: number; kind?: "table" | "seat" };

export type Venue = { id: string; name: string; address: string; timezone: string };

export type CameraKind = "indoor" | "outdoor" | "hybrid";
export type CameraSource = "upload" | "rtsp";

export type CameraState = "upload" | "disabled" | "pending" | "node_offline" | "connecting" | "online" | "error";

export type CameraStatus = {
  state: CameraState;
  nodeName?: string;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string;
  mainCodec?: string;
  lastFrameAt?: string | null;
  recording?: boolean;
  archiveFrom?: string | null;
  error?: string;
  errorCode?: string;
};

export type Camera = {
  id: string;
  venueId: string;
  name: string;
  source: CameraSource;
  kind: CameraKind;
  enabled: boolean;
  rtspDisplay: string;
  rtspSubDisplay: string;
  rtspUsername: string;
  analysisStream: "sub" | "main";
  nodeId: string | null;
  entryLine: EntryLine | null;
  hallZone: Zone | null;
  streetZone: Zone | null;
  doorZone: Zone | null;
  staffZone: Zone | null;
  queueZone: Zone | null;
  tables: Table[];
  tableSuggestions: TableSuggestion[];
  tableSuggestionsAt: string | null;
  markupVersion: number;
  snapshotAt: string | null;
  status: CameraStatus;
};

export type VideoStatus = "queued" | "processing" | "done" | "failed";

export type Video = {
  id: string;
  venueId: string;
  cameraId: string;
  originalName: string;
  format: string;
  sizeBytes: number;
  recordedAt: string;
  status: VideoStatus;
  progress: number;
  error: string;
  durationSec: number | null;
  sampleFps: number | null;
  trackCount: number | null;
  model: string;
  processedAt: string | null;
  sourceDeleted: boolean;
  createdAt: string;
};

export type WorkerInfo = { online: boolean; lastSeenAt: string | null; model: string; nodes?: number };

export type MetricsBucket = {
  start: string;
  coveredSec: number;
  entries: number | null;
  exits: number | null;
  occupancyAvg: number | null;
  occupancyMax: number | null;
};

export type CameraMetrics = {
  period: { from: string; to: string };
  videos: { id: string; originalName: string; recordedAt: string; durationSec: number }[];
  markup: { entryLine: boolean; hallZone: boolean };
  trackCount: number;
  entries: { total: number; exits: number } | null;
  occupancy: { peak: number; peakAt: string | null; average: number } | null;
  dwell: { averageSec: number | null; medianSec: number | null; tracks: number; minSec: number } | null;
  series: { bucketSeconds: number; buckets: MetricsBucket[] };
  heatmap: Heatmap;
};

export type Heatmap = { cols: number; rows: number; cells: number[] };

export type PeriodKey = "today" | "yesterday" | "7d" | "30d";

export type LiveBucket = {
  start: string;
  future: boolean;
  coveredSec: number;
  entries: number | null;
  exits: number | null;
  passersby: number | null;
  occupancyAvg: number | null;
  occupancyMax: number | null;
  tableRate: number | null;
};

export type LiveStats = {
  period: { key: PeriodKey; from: string; to: string; timezone: string };
  kind: CameraKind;
  markup: { entryLine: boolean; passZone: boolean; hallZone: boolean; tables: number };
  coverage: { coveredSec: number; spanSec: number };
  entries: { total: number; exits: number } | null;
  passersby: { total: number; conversion: number | null } | null;
  occupancy: { peak: number; peakAt: string | null; average: number } | null;
  dwell: { averageSec: number | null; tracks: number; minSec: number } | null;
  tables: {
    items: { id: string; label: string; occupiedSec: number; rate: number | null; sessions: number; avgSessionSec: number | null }[];
    averageRate: number | null;
    avgSessionSec: number | null;
  } | null;
  series: { bucket: "hour" | "day"; buckets: LiveBucket[] };
  tableGrid: { id: string; label: string; rates: (number | null)[] }[] | null;
  profile: { hour: number; coveredSec: number; entriesPerHour: number | null; passersbyPerHour: number | null; occupancyAvg: number | null }[] | null;
  heatmap: Heatmap;
  markupStaleBefore: string | null;
};

export type NowState = {
  status: CameraStatus;
  at: string | null;
  now: { people: number; inHall: number | null; outside: number; elsewhere?: number; hidden?: number; tables: { id: string; occupied: boolean; sinceSec: number | null }[] } | null;
  today: { entries: number; exits: number; passersby: number };
};

export type StaffColor = "violet" | "teal" | "amber" | "rose" | "sky" | "lime" | "indigo" | "brown";
export type StaffRole = "barista" | "waiter" | "cook" | "admin" | "other";

// Who a live box is: a numbered guest of the day or a staff member (filled by the API from the people of the day).
export type BoxLabel = { p: string; no: number; role: "guest" | "staff"; since: number; review: string | null; name?: string; color?: StaffColor };

// people: [trackId, x1, y1, x2, y2, conf, class?] — class 1 = a bicycle.
export type LiveFrame = { t: number; session?: string; people: ([number, number, number, number, number, number] | [number, number, number, number, number, number, number])[]; labels?: Record<string, BoxLabel> };

export type StaffMember = { id: string; venueId: string; name: string; role: StaffRole; color: StaffColor; active: boolean };

export type PersonReview = { kind: "staff_candidate" | "staff_uncertain"; suggestedStaffId: string | null };

export type Person = {
  id: string;
  no: number;
  role: "guest" | "staff";
  staffId: string | null;
  review: PersonReview | null;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  hallSec: number;
  staffSec: number;
  hasShot: boolean;
  cameraName?: string | null;
};

export type Visit = {
  id: string;
  personId: string;
  no: number | null;
  role: "guest" | "staff";
  staffId: string | null;
  cameraId: string;
  startAt: string;
  endAt: string | null;
  lastSeenAt: string;
  active: boolean;
  durationSec: number;
  hallSec: number;
  tables: { id: string; label: string; sec: number }[];
  enteredBy: "door" | "hall";
  exitedBy: "door" | "lost" | null;
  recordable: boolean;
  path?: [number, number, number][];
};

export type GuestsDay = {
  day: string;
  today: string;
  timezone: string;
  live: boolean;
  from: string;
  to: string;
  cameras: { id: string; name: string; kind: CameraKind; entryLine: boolean; hallZone: boolean }[];
  kpis: {
    guests: number;
    visits: number;
    returning: number;
    avgVisitSec: number | null;
    medianVisitSec: number | null;
    inHallNow: number | null;
    activeVisits: number;
    passersby: number | null;
    conversion: number | null;
    lastWeekGuests: number | null;
    reviews: number;
  };
  occupancy: { t: number; avg: number | null }[];
  gaps: { from: string; to: string }[];
  persons: Person[];
  visits: Visit[];
  passers: {
    pedestrians: number;
    cyclists: number;
    byHour: { hour: number; pedestrians: number; cyclists: number }[];
    items: Passer[];
  } | null;
};

export type Passer = { id: string; cameraId: string; at: string; from: string; to: string; kind: "pedestrian" | "cyclist"; hasShot: boolean };

export type StaffShift = {
  firstSeenAt: number;
  lastSeenAt: number;
  onSiteSec: number;
  counterSec: number;
  hallSec: number;
  exits: number;
  longestAbsenceSec: number;
  segments: { from: number; to: number; where: "counter" | "hall" | "frame" }[];
  absences: { from: number; to: number; sec: number }[];
  state: "counter" | "hall" | "frame" | "away" | "off";
  stateSince: number;
};

export type StaffDay = {
  day: string;
  today: string;
  timezone: string;
  live: boolean;
  from: string;
  to: string;
  zones: { staff: boolean; queue: boolean; camera: { id: string; name: string } | null };
  shifts: { staff: StaffMember; personIds: string[]; shift: StaffShift | null }[];
  reviews: Person[];
  waiting: { episodes: { from: number; to: number; sec: number; cameraId: string }[]; totalSec: number } | null;
};

export type ProbeResult = { ok: boolean; codec?: string; width?: number; height?: number; fps?: number | null; error?: string; errorCode?: string };

export type Probe = { node: string; main: ProbeResult | null; sub: ProbeResult | null; frame: string | null };

export type ArchiveInfo = {
  from: string;
  to: string;
  segments: { start: string; duration: number }[];
  activity: [number, number, number, number][];
  error: string;
};

export type Clip = { id: string; cameraId: string; start: string; durationSec: number; codec: "copy" | "h264"; status: "pending" | "ready" | "failed"; error: string; sizeBytes: number | null };

export type ProcessingNode = {
  id: string;
  slug: string;
  name: string;
  managedBy: "admin" | "env";
  enabled: boolean;
  maxCameras: number;
  lastSeenAt: string | null;
  version: string;
  online: boolean;
  connected: boolean;
  cameraCount: number;
  info: { hostname?: string; platform?: string; cpuCount?: number; device?: string; gpu?: string; model?: string; nvenc?: boolean; liveFps?: number };
  stats: {
    cpu?: number;
    ramPercent?: number;
    ramTotalBytes?: number;
    disk?: { totalBytes?: number; freeBytes?: number };
    gpus?: { name: string; util: number; memUsedMb: number; memTotalMb: number; tempC: number }[];
    uptimeSec?: number;
    camerasOnline?: number;
    analysisFps?: number;
    jobActive?: boolean;
  };
};

export type NodeSetup = { env: string; commands: string[]; gpuCommand: string };

export type AdminCamera = { id: string; name: string; kind: CameraKind; venue: string; owner: string; nodeId: string | null; rtspDisplay: string; status: CameraStatus };

export type PageKey = "overview" | "guests" | "staff" | "cameras" | "videos" | "admin";

export type PageContext = {
  venue: Venue | null;
  cameras: Camera[];
  videos: Video[];
  worker: WorkerInfo | null;
  refresh: () => Promise<void>;
  go: (page: PageKey) => void;
  openVenueModal: () => void;
};
