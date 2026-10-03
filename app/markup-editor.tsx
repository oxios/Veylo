"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, DoorOpen, Footprints, LayoutGrid, Loader2, MousePointer2, Plus, RotateCcw, Save, ScanSearch, SquareDashed, Trash2, Undo2, UserCog, Users, WandSparkles } from "lucide-react";
import { ApiError, apiFetch } from "./api-client";
import { ProgressBar } from "./video-status";
import { CameraFrame, centroid, insideArrow, polygonPoints } from "./camera-ui";
import type { Camera, EntryLine, Point, Table, Zone } from "./types";

type ZoneKey = "hallZone" | "streetZone" | "doorZone" | "staffZone" | "queueZone";
type Tool = "select" | "line" | ZoneKey | "table" | "sam";
type Draft = {
  entryLine: EntryLine | null;
  hallZone: Zone | null;
  streetZone: Zone | null;
  doorZone: Zone | null;
  staffZone: Zone | null;
  queueZone: Zone | null;
  tables: Table[];
};

const ZONE_KEYS: ZoneKey[] = ["hallZone", "streetZone", "doorZone", "staffZone", "queueZone"];
const isZoneTool = (tool: Tool): tool is ZoneKey => (ZONE_KEYS as string[]).includes(tool);
type VertexRef = { layer: "entryLine" | ZoneKey; index: number } | { layer: "table"; id: string; index: number };

const clamp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

const zoneMeta: Record<ZoneKey, { label: string; hint: string; className: string }> = {
  hallZone: { label: "Зона залу", hint: "Обведіть підлогу залу: рахуємо точку, де стоять ноги", className: "zone-hall" },
  streetZone: { label: "Тротуар", hint: "Обведіть тротуар перед входом: хто тут пройшов і не зайшов — «пройшов повз»", className: "zone-street" },
  doorZone: { label: "Проріз дверей", hint: "Обведіть дверний проріз, крізь який видно вулицю", className: "zone-door" },
  staffZone: { label: "Персонал", hint: "Обведіть підлогу за стійкою: хто тут стоїть — працівник, а не гість", className: "zone-staff" },
  queueZone: { label: "Черга", hint: "Обведіть місце перед стійкою, де гості чекають замовлення", className: "zone-queue" },
};

function draftOf(camera: Camera): Draft {
  return {
    entryLine: camera.entryLine,
    hallZone: camera.hallZone,
    streetZone: camera.streetZone,
    doorZone: camera.doorZone,
    staffZone: camera.staffZone ?? null,
    queueZone: camera.queueZone ?? null,
    tables: camera.tables ?? [],
  };
}

function toolsFor(kind: Camera["kind"], live: boolean): { tool: Tool; label: string; icon: typeof DoorOpen }[] {
  const select = { tool: "select" as Tool, label: "Редагувати", icon: MousePointer2 };
  if (kind === "outdoor") {
    return [select, { tool: "line", label: "Лінія дверей", icon: DoorOpen }, { tool: "streetZone", label: "Тротуар", icon: Footprints }];
  }
  const inside: { tool: Tool; label: string; icon: typeof DoorOpen }[] = [
    { tool: "hallZone", label: "Зала", icon: SquareDashed },
    { tool: "staffZone", label: "Персонал", icon: UserCog },
    { tool: "queueZone", label: "Черга", icon: Users },
    { tool: "table", label: "Столик", icon: LayoutGrid },
    ...(live ? [{ tool: "sam" as Tool, label: "Обвести (SAM 2)", icon: WandSparkles }] : []),
  ];
  if (kind === "hybrid") {
    return [select, { tool: "line", label: "Поріг", icon: DoorOpen }, { tool: "doorZone", label: "Проріз дверей", icon: SquareDashed }, ...inside];
  }
  return [select, ...inside];
}

function nextTableId(tables: Table[], kind: "table" | "seat" = "table") {
  let index = tables.length + 1;
  while (tables.some((table) => table.id === `t${index}`)) index += 1;
  return { id: `t${index}`, label: `${kind === "seat" ? "Місце" : "Стіл"} ${index}` };
}

function suggestionSummary(kinds: (string | undefined)[]) {
  const tables = kinds.filter((kind) => kind !== "seat").length;
  const seats = kinds.length - tables;
  return [
    tables ? `${tables} ${tables === 1 ? "столик" : "столики"}` : "",
    seats ? `${seats} ${seats === 1 ? "місце посадки" : "місця посадки"}` : "",
  ].filter(Boolean).join(" і ");
}

function requirements(kind: Camera["kind"], draft: Draft): string[] {
  const missing = [];
  if (kind !== "indoor" && !draft.entryLine) missing.push(kind === "outdoor" ? "лінія дверей (для «зайшло»)" : "поріг (для «зайшло»)");
  if (kind === "outdoor" && !draft.streetZone) missing.push("тротуар (для «пройшло повз»)");
  if (kind === "hybrid" && !draft.doorZone) missing.push("проріз дверей (для «пройшло повз»)");
  if (kind !== "outdoor" && draft.tables.length === 0) missing.push("столики (для зайнятості)");
  return missing;
}

export function MarkupEditor({ camera, onSaved }: { camera: Camera; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(camera));
  const [history, setHistory] = useState<Draft[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [drawing, setDrawing] = useState<Point[]>([]);
  const [rect, setRect] = useState<{ from: Point; to: Point } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [drag, setDrag] = useState<VertexRef | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [segmenting, setSegmenting] = useState<Point | null>(null);
  const [recompute, setRecompute] = useState<{ pendingHours: number; totalHours: number } | null>(null);
  const [recomputeStarted, setRecomputeStarted] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<Draft | null>(null);

  const saved = draftOf(camera);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const live = camera.source === "rtsp";

  // After saving a live camera the API recomputes stored hours; show how far it got.
  useEffect(() => {
    if (!recomputeStarted) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await apiFetch<{ recompute: { pendingHours: number; totalHours: number } }>(`/cameras/${camera.id}/recompute`);
        if (cancelled) return;
        setRecompute(result.recompute);
        if (result.recompute.pendingHours > 0) timer = window.setTimeout(() => void poll(), 1500);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 4000);
      }
    };
    let timer = window.setTimeout(() => void poll(), 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [recomputeStarted, camera.id]);

  // Escape cancels the shape in progress.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawing([]);
        setRect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commit = (next: Draft, previous: Draft = draft) => {
    setHistory((items) => [...items.slice(-30), previous]);
    setDraft(next);
    setMessage("");
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setDraft(previous);
  };

  const pointFrom = (event: { clientX: number; clientY: number }): Point => {
    const box = frameRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  };

  const chooseTool = (next: Tool) => {
    setTool(next);
    setDrawing([]);
    setRect(null);
  };

  const finishPolygon = (points: Point[]) => {
    if (points.length < 3 || !isZoneTool(tool)) return;
    commit({ ...draft, [tool]: { points } });
    setDrawing([]);
    setTool("select");
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = pointFrom(event);
    if (tool === "table") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setRect({ from: point, to: point });
      return;
    }
    if (tool === "line") {
      if (!drawing.length) {
        setDrawing([point]);
      } else {
        commit({ ...draft, entryLine: { a: drawing[0], b: point, inside: draft.entryLine?.inside ?? "positive" } });
        setDrawing([]);
        setTool("select");
      }
      return;
    }
    if (tool === "sam") {
      if (!segmenting) void outlineAt(point);
      return;
    }
    if (isZoneTool(tool)) {
      const first = drawing[0];
      if (first && drawing.length >= 3 && Math.hypot(first.x - point.x, first.y - point.y) < 0.025) {
        finishPolygon(drawing);
        return;
      }
      if (drawing.length < 24) setDrawing([...drawing, point]);
      return;
    }
    setSelectedTable(null);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFrom(event);
    setCursor(point);
    if (rect) setRect({ ...rect, to: point });
    if (!drag) return;
    setDraft((current) => {
      if (drag.layer === "entryLine" && current.entryLine) {
        return { ...current, entryLine: { ...current.entryLine, [drag.index === 0 ? "a" : "b"]: point } };
      }
      if (drag.layer === "table") {
        return { ...current, tables: current.tables.map((table) => (table.id === drag.id ? { ...table, points: table.points.map((p, i) => (i === drag.index ? point : p)) } : table)) };
      }
      if (drag.layer !== "entryLine") {
        const zone = current[drag.layer];
        if (zone) return { ...current, [drag.layer]: { points: zone.points.map((p, i) => (i === drag.index ? point : p)) } };
      }
      return current;
    });
  };

  const onPointerUp = () => {
    if (drag) {
      if (dragStart.current) {
        const before = dragStart.current;
        setHistory((items) => [...items.slice(-30), before]);
      }
      setDrag(null);
      dragStart.current = null;
    }
    if (rect) {
      const x1 = Math.min(rect.from.x, rect.to.x);
      const x2 = Math.max(rect.from.x, rect.to.x);
      const y1 = Math.min(rect.from.y, rect.to.y);
      const y2 = Math.max(rect.from.y, rect.to.y);
      setRect(null);
      if (x2 - x1 > 0.01 && y2 - y1 > 0.01) {
        const meta = nextTableId(draft.tables);
        commit({ ...draft, tables: [...draft.tables, { ...meta, points: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }] }] });
        setSelectedTable(meta.id);
      }
    }
  };

  const startDrag = (event: ReactPointerEvent, ref: VertexRef) => {
    if (tool !== "select") return;
    event.stopPropagation();
    frameRef.current?.setPointerCapture(event.pointerId);
    dragStart.current = draft;
    setDrag(ref);
    if (ref.layer === "table") setSelectedTable(ref.id);
  };

  const removeVertex = (ref: VertexRef) => {
    if (ref.layer === "entryLine") return;
    if (ref.layer === "table") {
      const table = draft.tables.find((item) => item.id === ref.id);
      if (!table || table.points.length <= 3) return;
      commit({ ...draft, tables: draft.tables.map((item) => (item.id === ref.id ? { ...item, points: item.points.filter((_, i) => i !== ref.index) } : item)) });
      return;
    }
    const zone = draft[ref.layer];
    if (!zone || zone.points.length <= 3) return;
    commit({ ...draft, [ref.layer]: { points: zone.points.filter((_, i) => i !== ref.index) } });
  };

  const addSuggestion = (index: number) => {
    const s = camera.tableSuggestions[index];
    const meta = nextTableId(draft.tables, s.kind);
    commit({ ...draft, tables: [...draft.tables, { ...meta, points: [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: s.x1, y: s.y2 }] }] });
  };

  const addAllSuggestions = () => {
    let tables = [...draft.tables];
    camera.tableSuggestions.forEach((s, index) => {
      if (coveredSuggestions.has(index)) return;
      const meta = nextTableId(tables, s.kind);
      tables = [...tables, { ...meta, points: [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: s.x1, y: s.y2 }] }];
    });
    commit({ ...draft, tables });
  };

  // SAM 2 on the node outlines the object under the click; the outline becomes a seat/table zone.
  const outlineAt = async (point: Point) => {
    setSegmenting(point);
    setMessage("");
    try {
      const result = await apiFetch<{ outline: { points: Point[] } }>(`/cameras/${camera.id}/segment`, { method: "POST", body: JSON.stringify(point) });
      const meta = nextTableId(draft.tables, "seat");
      commit({ ...draft, tables: [...draft.tables, { ...meta, points: result.outline.points }] });
      setSelectedTable(meta.id);
      setMessage(`Обведено: ${meta.label}. Перейменуйте його праворуч або підправте точки.`);
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 422
        ? "Тут немає окремого предмета: клікніть по самому кріслу чи столу, а не по підлозі."
        : error instanceof Error ? error.message : "Не вдалося обвести предмет");
    } finally {
      setSegmenting(null);
    }
  };

  const detectTables = async () => {
    setDetecting(true);
    setMessage("");
    try {
      await apiFetch(`/cameras/${camera.id}/tables/detect`, { method: "POST" });
      setMessage("Шукаємо столики на свіжому кадрі… Підказки з’являться за хвилину.");
      window.setTimeout(() => void onSaved(), 20_000);
      window.setTimeout(() => void onSaved(), 45_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося запустити пошук столиків");
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/cameras/${camera.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      await onSaved();
      setHistory([]);
      setMessage("Розмітку збережено.");
      if (live) {
        setRecompute(null);
        setRecomputeStarted(Date.now());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося зберегти розмітку");
    } finally {
      setBusy(false);
    }
  };

  // Suggestions already covered by a drawn table (≥ 30 % of the suggestion's box overlaps it) are hidden.
  const coveredSuggestions = new Set(camera.tableSuggestions.map((s, index) => {
    const area = Math.max(1e-6, (s.x2 - s.x1) * (s.y2 - s.y1));
    return draft.tables.some((table) => {
      const xs = table.points.map((p) => p.x);
      const ys = table.points.map((p) => p.y);
      const overlapX = Math.max(0, Math.min(s.x2, Math.max(...xs)) - Math.max(s.x1, Math.min(...xs)));
      const overlapY = Math.max(0, Math.min(s.y2, Math.max(...ys)) - Math.max(s.y1, Math.min(...ys)));
      return (overlapX * overlapY) / area >= 0.3;
    }) ? index : -1;
  }).filter((index) => index >= 0));
  const openSuggestions = camera.tableSuggestions.map((s, index) => ({ s, index })).filter(({ index }) => !coveredSuggestions.has(index));

  const tools = toolsFor(camera.kind, live);
  const arrow = draft.entryLine ? insideArrow(draft.entryLine) : null;
  const missing = requirements(camera.kind, draft);
  const zoneTool = isZoneTool(tool) ? tool : null;
  const hint = tool === "line"
    ? drawing.length ? "Клікніть другу точку лінії" : "Клікніть початок і кінець лінії на порозі дверей"
    : zoneTool ? (drawing.length < 3 ? `${zoneMeta[zoneTool].hint}. Ще ${3 - drawing.length} точки мінімум` : "Клікніть першу точку або «Завершити», щоб замкнути зону")
      : tool === "table" ? "Протягніть прямокутник по стільниці. Потім кути можна підтягнути під перспективу"
        : tool === "sam" ? (segmenting ? "SAM 2 обводить предмет на свіжому кадрі…" : "Клікніть по кріслу, дивану чи столу — SAM 2 обведе його за контуром")
        : "Перетягуйте точки. Подвійний клік по точці зони чи столика — видалити її";

  const vertex = (key: string, p: Point, ref: VertexRef, className: string) => (
    <i
      key={key}
      className={`handle ${className}${tool === "select" ? " draggable" : ""}`}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
      onPointerDown={(event) => startDrag(event, ref)}
      onDoubleClick={() => removeVertex(ref)}
    />
  );

  return (
    <div className="markup">
      <div className="markup-tools" role="group" aria-label="Інструмент розмітки">
        {tools.map(({ tool: item, label, icon: Icon }) => (
          <button key={item} type="button" className={tool === item ? "tool active" : "tool"} aria-pressed={tool === item} onClick={() => chooseTool(item)}><Icon />{label}</button>
        ))}
        <span className="toolbar-spacer" />
        <button type="button" className="tool" disabled={!history.length} onClick={undo} title="Скасувати останню дію"><Undo2 />Назад</button>
      </div>
      <p className="markup-hint" role="status">{hint}</p>

      <div className="markup-body">
        <div
          ref={frameRef}
          className={`markup-canvas tool-${tool}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursor(null)}
          role="presentation"
        >
          <CameraFrame camera={camera} />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            {ZONE_KEYS.map((key) => draft[key] && <polygon key={key} className={`zone-shape ${zoneMeta[key].className}`} points={polygonPoints(draft[key]!.points)} />)}
            {openSuggestions.map(({ s, index }) => <rect key={`s${index}`} className="suggestion-shape" x={s.x1} y={s.y1} width={s.x2 - s.x1} height={s.y2 - s.y1} />)}
            {draft.tables.map((table) => <polygon key={table.id} className={`table-shape editing${selectedTable === table.id ? " selected" : ""}`} points={polygonPoints(table.points)} />)}
            {draft.entryLine && <line className="entry-line" x1={draft.entryLine.a.x} y1={draft.entryLine.a.y} x2={draft.entryLine.b.x} y2={draft.entryLine.b.y} />}
            {arrow && <line className="entry-arrow" x1={arrow.mid.x} y1={arrow.mid.y} x2={arrow.tip.x} y2={arrow.tip.y} />}
            {drawing.length > 0 && zoneTool && <polyline className={`zone-draft ${zoneMeta[zoneTool].className}`} points={polygonPoints(cursor ? [...drawing, cursor] : drawing)} />}
            {drawing.length === 1 && tool === "line" && cursor && <line className="entry-line draft" x1={drawing[0].x} y1={drawing[0].y} x2={cursor.x} y2={cursor.y} />}
            {rect && <rect className="table-shape editing" x={Math.min(rect.from.x, rect.to.x)} y={Math.min(rect.from.y, rect.to.y)} width={Math.abs(rect.to.x - rect.from.x)} height={Math.abs(rect.to.y - rect.from.y)} />}
          </svg>
          {ZONE_KEYS.flatMap((key) => (draft[key]?.points ?? []).map((p, index) => vertex(`${key}${index}`, p, { layer: key, index }, zoneMeta[key].className)))}
          {segmenting && <span className="segmenting" style={{ left: `${segmenting.x * 100}%`, top: `${segmenting.y * 100}%` }}><Loader2 className="spin" /></span>}
          {draft.tables.flatMap((table) => table.points.map((p, index) => vertex(`${table.id}-${index}`, p, { layer: "table", id: table.id, index }, "table")))}
          {draft.entryLine && [draft.entryLine.a, draft.entryLine.b].map((p, index) => vertex(`line${index}`, p, { layer: "entryLine", index }, "line"))}
          {drawing.map((p, index) => <i key={`d${index}`} className={`handle pending ${zoneTool ? zoneMeta[zoneTool].className : "line"}${index === 0 && drawing.length >= 3 ? " closable" : ""}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />)}
          {arrow && <em className="inside-label" style={{ left: `${arrow.tip.x * 100}%`, top: `${arrow.tip.y * 100}%` }}>всередину</em>}
          {draft.tables.map((table) => {
            const c = centroid(table.points);
            return <em key={`label-${table.id}`} className={`table-label${selectedTable === table.id ? " selected" : ""}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>{table.label}</em>;
          })}
          {openSuggestions.map(({ s, index }) => (
            <button
              key={`add${index}`}
              type="button"
              className="suggestion-add"
              style={{ left: `${((s.x1 + s.x2) / 2) * 100}%`, top: `${((s.y1 + s.y2) / 2) * 100}%` }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => addSuggestion(index)}
              aria-label={s.kind === "seat" ? "Додати знайдене місце посадки" : "Додати знайдений столик"}
              title={s.kind === "seat" ? "Місце посадки (крісло / диван)" : "Столик"}
            ><Plus /></button>
          ))}
        </div>

        <aside className="markup-panel">
          <section>
            <h3>Що розмічено</h3>
            <ul className="markup-legend">
              {camera.kind !== "indoor" && (
                <li className={draft.entryLine ? "ok" : ""}>
                  <i className="swatch line" />
                  <span>{camera.kind === "outdoor" ? "Лінія дверей" : "Поріг"}</span>
                  {draft.entryLine ? (
                    <span className="legend-actions">
                      <button type="button" className="icon-button soft" title="Змінити напрямок входу" aria-label="Змінити напрямок входу" onClick={() => commit({ ...draft, entryLine: { ...draft.entryLine!, inside: draft.entryLine!.inside === "positive" ? "negative" : "positive" } })}><ArrowLeftRight /></button>
                      <button type="button" className="icon-button" aria-label="Прибрати лінію дверей" onClick={() => commit({ ...draft, entryLine: null })}><Trash2 /></button>
                    </span>
                  ) : <small>не задано</small>}
                </li>
              )}
              {(camera.kind === "outdoor" ? ["streetZone"] : camera.kind === "hybrid" ? ["doorZone", "hallZone", "staffZone", "queueZone"] : ["hallZone", "staffZone", "queueZone"] as ZoneKey[]).map((key) => {
                const zoneKey = key as ZoneKey;
                return (
                  <li key={zoneKey} className={draft[zoneKey] ? "ok" : ""}>
                    <i className={`swatch ${zoneMeta[zoneKey].className}`} />
                    <span>{zoneMeta[zoneKey].label}{(zoneKey === "hallZone" || zoneKey === "staffZone" || zoneKey === "queueZone") && <small> · необов’язково</small>}</span>
                    {draft[zoneKey] ? <button type="button" className="icon-button" aria-label={`Прибрати: ${zoneMeta[zoneKey].label}`} onClick={() => commit({ ...draft, [zoneKey]: null })}><Trash2 /></button> : <small>{zoneKey === "hallZone" ? "весь кадр" : zoneKey === "staffZone" ? "для персоналу" : zoneKey === "queueZone" ? "для очікування" : "не задано"}</small>}
                  </li>
                );
              })}
            </ul>
            {drawing.length >= 3 && zoneTool && <button type="button" className="primary block" onClick={() => finishPolygon(drawing)}><Check />Завершити зону</button>}
          </section>

          {camera.kind !== "outdoor" && (
            <section>
              <h3>Столики <span className="count">{draft.tables.length}</span></h3>
              {draft.tables.length === 0 && <p className="muted small">Протягніть прямокутник інструментом «Столик» або додайте знайдені автоматично.</p>}
              <ul className="table-list">
                {draft.tables.map((table) => (
                  <li key={table.id} className={selectedTable === table.id ? "selected" : ""}>
                    <i className="swatch table" />
                    <input
                      aria-label={`Назва столика ${table.label}`}
                      value={table.label}
                      maxLength={40}
                      onFocus={() => setSelectedTable(table.id)}
                      onChange={(event) => setDraft({ ...draft, tables: draft.tables.map((item) => (item.id === table.id ? { ...item, label: event.target.value } : item)) })}
                    />
                    <button type="button" className="icon-button" aria-label={`Видалити ${table.label}`} onClick={() => commit({ ...draft, tables: draft.tables.filter((item) => item.id !== table.id) })}><Trash2 /></button>
                  </li>
                ))}
              </ul>
              {live && (
                <div className="suggest-box">
                  <span><ScanSearch />{openSuggestions.length ? `YOLO знайшов: ${suggestionSummary(openSuggestions.map(({ s }) => s.kind))} — пунктир на кадрі` : camera.tableSuggestionsAt ? (draft.tables.length ? "Нових підказок немає" : "Підказок немає — розмітьте столики вручну") : "Підказки ще не готові"}</span>
                  <div>
                    {openSuggestions.length > 0 && <button type="button" className="secondary" onClick={addAllSuggestions}><Plus />Додати всі</button>}
                    <button type="button" className="secondary" disabled={detecting || camera.status.state !== "online"} onClick={() => void detectTables()}><ScanSearch />Знайти зараз</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {missing.length > 0 && (
            <section className="markup-missing">
              <h3>Щоб усі показники рахувались</h3>
              <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          <div className="markup-save">
            <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => { setDraft(saved); setHistory([]); }}><RotateCcw />Скасувати зміни</button>
            <button type="button" className="primary" disabled={busy || !dirty || drawing.length > 0} onClick={() => void save()}><Save />{busy ? "Зберігаємо…" : "Зберегти"}</button>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          {recomputeStarted > 0 && (
            <div className="recompute" role="status">
              {recompute === null ? <span>Перераховуємо показники за останні 7 днів…</span>
                : recompute.pendingHours > 0 ? (
                  <>
                    <span>Перераховуємо історію: {recompute.totalHours - recompute.pendingHours} з {recompute.totalHours} год</span>
                    <ProgressBar value={recompute.totalHours ? (recompute.totalHours - recompute.pendingHours) / recompute.totalHours : 0} label="Перерахунок показників" />
                  </>
                ) : <span className="done"><Check />Показники за {recompute.totalHours} год перераховано за новою розміткою</span>}
            </div>
          )}
        </aside>
      </div>
      <p className="footnote">Стрілка показує, куди людина заходить. Усі зони малюйте по підлозі — ми рахуємо точку, де стоять ноги. {live ? "Зміна розмітки перераховує показники за останні 7 днів (стільки зберігаються треки)." : "Розмітку можна змінювати без повторної обробки відео."}</p>
    </div>
  );
}
