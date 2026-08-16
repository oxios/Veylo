"use client";

import {
  Camera,
  Circle,
  Copy,
  DoorOpen,
  Eye,
  Grid3X3,
  Grip,
  Image as ImageIcon,
  ImageOff,
  Layers3,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  Save,
  SlidersHorizontal,
  Square,
  Table2,
  TextCursorInput,
  Trash2,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import "./plan-canvas.css";

export type PlanElement = {
  id: string;
  floor: string;
  kind: "table" | "camera" | "wall" | "door" | "label";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  shape?: "rectangle" | "round" | "line" | "icon";
  color?: string;
  zIndex?: number;
  locked?: boolean;
  viewAngle?: number;
  viewRadius?: number;
  viewEnabled?: boolean;
  seats?: number;
  zoneId?: string | null;
};

export type PlanCanvasZone = {
  id: string;
  name: string;
  type?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  capacity: number;
  coverage: number;
};

export type PlanCanvasProps = {
  floor: string;
  elements: PlanElement[];
  zones: PlanCanvasZone[];
  selectedZoneId: string;
  onSelectZone: (id: string) => void;
  onDeleteZones?: (ids: string[]) => void | Promise<void>;
  onCreateZone?: () => void;
  onZonesChange?: (next: PlanCanvasZone[]) => void;
  onCommitZones?: (next: PlanCanvasZone[]) => void | Promise<void>;
  onElementsChange: (next: PlanElement[]) => void;
  onCommit: (next: PlanElement[]) => void;
  planFileName?: string;
  backgroundImageUrl?: string;
  planSource?: "pdf" | "image" | "manual";
  backgroundMode?: "floor-plan" | "camera-view";
  readOnly?: boolean;
};

type ElementKind = PlanElement["kind"];
type ElementShape = NonNullable<PlanElement["shape"]>;

type LibraryItem = {
  id: string;
  group: "Конструкция" | "Мебель" | "Обозначения";
  kind: ElementKind;
  label: string;
  hint: string;
  width: number;
  height: number;
  shape: ElementShape;
  color: string;
  seats?: number;
};

type DragState = {
  id: string;
  origins: Record<string, { x: number; y: number; width: number; height: number }>;
  pointerId: number;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  moved: boolean;
};

type ZoneDragState = {
  id: string;
  origins: Record<string, { left: number; top: number; width: number; height: number }>;
  pointerId: number;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type SelectionBox = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

const LIBRARY: LibraryItem[] = [
  { id: "wall", group: "Конструкция", kind: "wall", label: "Стена", hint: "Прямая секция", width: 24, height: 1.8, shape: "line", color: "#5d6964" },
  { id: "short-wall", group: "Конструкция", kind: "wall", label: "Перегородка", hint: "Короткая стена", width: 13, height: 1.5, shape: "line", color: "#6c7772" },
  { id: "door", group: "Конструкция", kind: "door", label: "Дверь", hint: "Обычный проём", width: 8, height: 3, shape: "icon", color: "#a86c2f" },
  { id: "wide-door", group: "Конструкция", kind: "door", label: "Широкий вход", hint: "Двойной проём", width: 13, height: 3, shape: "icon", color: "#a86c2f" },
  { id: "round-table", group: "Мебель", kind: "table", label: "Круглый стол", hint: "4 места", width: 6.5, height: 8, shape: "round", color: "#a97832", seats: 4 },
  { id: "square-table", group: "Мебель", kind: "table", label: "Стол", hint: "4 места", width: 7, height: 8, shape: "rectangle", color: "#8d672f", seats: 4 },
  { id: "long-table", group: "Мебель", kind: "table", label: "Большой стол", hint: "8 мест", width: 14, height: 7, shape: "rectangle", color: "#8d672f", seats: 8 },
  { id: "bar-counter", group: "Мебель", kind: "table", label: "Барная стойка", hint: "6 мест", width: 20, height: 5, shape: "rectangle", color: "#6f5837", seats: 6 },
  { id: "camera", group: "Обозначения", kind: "camera", label: "Камера", hint: "Точка установки", width: 5, height: 7, shape: "icon", color: "#2e88b3" },
  { id: "label", group: "Обозначения", kind: "label", label: "Подпись", hint: "Название зоны", width: 15, height: 6, shape: "rectangle", color: "#3d5048" },
  { id: "exit", group: "Обозначения", kind: "label", label: "Выход", hint: "Навигация", width: 11, height: 5, shape: "rectangle", color: "#1d8060" },
];

const GROUPS: LibraryItem["group"][] = ["Конструкция", "Мебель", "Обозначения"];

const KIND_LABELS: Record<ElementKind, string> = {
  table: "Мебель",
  camera: "Камера",
  wall: "Стена",
  door: "Дверь",
  label: "Подпись",
};

function KindIcon({ kind, shape }: { kind: ElementKind; shape?: ElementShape }) {
  if (kind === "table") return shape === "round" ? <Circle aria-hidden="true" /> : <Table2 aria-hidden="true" />;
  if (kind === "camera") return <Camera aria-hidden="true" />;
  if (kind === "wall") return <RectangleHorizontal aria-hidden="true" />;
  if (kind === "door") return <DoorOpen aria-hidden="true" />;
  return <TextCursorInput aria-hidden="true" />;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function cloneElements(elements: PlanElement[]) {
  return elements.map((item) => ({ ...item }));
}

function makeId(kind: ElementKind) {
  if (globalThis.crypto?.randomUUID) return `${kind}-${globalThis.crypto.randomUUID()}`;
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function tableSeatCount(item: Pick<PlanElement, "kind" | "width" | "label" | "seats">) {
  if (item.kind !== "table") return 0;
  if (Number.isFinite(item.seats) && Number(item.seats) > 0) return Math.round(Number(item.seats));
  if (/барн|bar/i.test(item.label)) return 6;
  return item.width >= 12 ? 8 : 4;
}

function cameraViewPath(item: PlanElement) {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const radius = clamp(item.viewRadius ?? 28, 5, 60);
  const angle = clamp(item.viewAngle ?? 70, 20, 160);
  const direction = item.rotation - 90;
  const start = (direction - angle / 2) * Math.PI / 180;
  const end = (direction + angle / 2) * Math.PI / 180;
  const startX = centerX + Math.cos(start) * radius;
  const startY = centerY + Math.sin(start) * radius;
  const endX = centerX + Math.cos(end) * radius;
  const endY = centerY + Math.sin(end) * radius;
  return `M ${centerX} ${centerY} L ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;
}

function cameraZoneFor(item: PlanElement, zones: PlanCanvasZone[]) {
  if (item.kind !== "camera") return null;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return zones.find((zone) => centerX >= zone.left && centerX <= zone.left + zone.width && centerY >= zone.top && centerY <= zone.top + zone.height) ?? null;
}

export default function PlanCanvas({
  floor,
  elements,
  zones,
  selectedZoneId,
  onSelectZone,
  onDeleteZones,
  onCreateZone,
  onZonesChange,
  onCommitZones,
  onElementsChange,
  onCommit,
  planFileName,
  backgroundImageUrl,
  planSource,
  backgroundMode = "floor-plan",
  readOnly = false,
}: PlanCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef(elements);
  const zonesRef = useRef(zones);
  const interactionRef = useRef<DragState | null>(null);
  const zoneInteractionRef = useRef<ZoneDragState | null>(null);
  const suppressZoneClickRef = useRef(false);
  const selectionRef = useRef<SelectionBox | null>(null);
  const clipboardRef = useRef<PlanElement[]>([]);
  const undoRef = useRef<PlanElement[][]>([]);
  const redoRef = useRef<PlanElement[][]>([]);
  const propertyEditingRef = useRef(false);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>(() => selectedZoneId ? [selectedZoneId] : []);
  const [canvasZones, setCanvasZones] = useState<PlanCanvasZone[]>(zones);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [zoom, setZoom] = useState(100);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [cameraViewsVisible, setCameraViewsVisible] = useState(true);
  const [photoVisible, setPhotoVisible] = useState(true);
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [libraryTab, setLibraryTab] = useState<"objects" | "zones">("objects");
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [backgroundAspectRatio, setBackgroundAspectRatio] = useState<number | null>(null);
  const [stageAspectRatio, setStageAspectRatio] = useState(2);
  const floorElements = elements.filter((item) => item.floor === floor);
  const selectedElementId = selectedElementIds.at(-1) ?? null;
  const effectiveSelectedZoneIds = selectedZoneIds.length ? selectedZoneIds : selectedZoneId ? [selectedZoneId] : [];
  const selectedElement = elements.find((item) => item.id === selectedElementId && item.floor === floor) ?? null;
  const selectedPlanZone = canvasZones.find((item) => item.id === effectiveSelectedZoneIds.at(-1)) ?? null;
  const selectedCameraZone = selectedElement?.kind === "camera"
    ? cameraZoneFor(selectedElement, canvasZones)
    : null;

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    if (zoneInteractionRef.current) return;
    zonesRef.current = zones;
    setCanvasZones(zones);
  }, [zones]);

  useEffect(() => {
    const stage = boardRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStageAspectRatio(width / height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fullScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [fullScreen]);

  const quantize = (value: number) => snapToGrid ? Math.round(value * 2) / 2 : rounded(value);

  const publish = (next: PlanElement[], commit = false) => {
    const withCameraZones = next.map((item) => item.floor === floor && item.kind === "camera"
      ? { ...item, zoneId: cameraZoneFor(item, canvasZones)?.id ?? null }
      : item);
    elementsRef.current = withCameraZones;
    onElementsChange(withCameraZones);
    if (commit) {
      onCommit(withCameraZones);
      setSavedAt(new Date());
    }
  };

  const publishZones = (next: PlanCanvasZone[], commit = false) => {
    zonesRef.current = next;
    setCanvasZones(next);
    if (commit) {
      onZonesChange?.(next);
      void onCommitZones?.(next);
      setSavedAt(new Date());
    }
  };

  const updateSelectedZone = (patch: Partial<PlanCanvasZone>, commit = false) => {
    if (!selectedPlanZone) return;
    const next = zonesRef.current.map((item) => item.id === selectedPlanZone.id ? { ...item, ...patch } : item);
    publishZones(next, commit);
  };

  const commitSelectedZone = () => {
    if (!selectedPlanZone) return;
    const next = zonesRef.current.map((item) => item.id === selectedPlanZone.id ? {
      ...item,
      name: item.name.trim() || "Новая зона",
      type: item.type?.trim() || "Dining",
      capacity: Math.max(0, Math.round(item.capacity)),
    } : item);
    publishZones(next, true);
  };

  const zoneNumericPatch = (field: "left" | "top" | "width" | "height" | "capacity", rawValue: string) => {
    if (!selectedPlanZone) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    if (field === "capacity") updateSelectedZone({ capacity: clamp(Math.round(value), 0, 100_000) });
    if (field === "left") updateSelectedZone({ left: rounded(clamp(value, 0, 100 - selectedPlanZone.width)) });
    if (field === "top") updateSelectedZone({ top: rounded(clamp(value, 0, 100 - selectedPlanZone.height)) });
    if (field === "width") updateSelectedZone({ width: rounded(clamp(value, 3, 100 - selectedPlanZone.left)) });
    if (field === "height") updateSelectedZone({ height: rounded(clamp(value, 3, 100 - selectedPlanZone.top)) });
  };

  const pushHistory = () => {
    undoRef.current = [...undoRef.current.slice(-39), cloneElements(elementsRef.current)];
    redoRef.current = [];
    setHistoryState({ undo: undoRef.current.length, redo: 0 });
  };

  const undo = () => {
    const previous = undoRef.current.at(-1);
    if (!previous) return;
    redoRef.current = [...redoRef.current.slice(-39), cloneElements(elementsRef.current)];
    undoRef.current = undoRef.current.slice(0, -1);
    publish(cloneElements(previous), true);
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length });
  };

  const redo = () => {
    const nextSnapshot = redoRef.current.at(-1);
    if (!nextSnapshot) return;
    undoRef.current = [...undoRef.current.slice(-39), cloneElements(elementsRef.current)];
    redoRef.current = redoRef.current.slice(0, -1);
    publish(cloneElements(nextSnapshot), true);
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length });
  };

  const addElement = (template: LibraryItem) => {
    pushHistory();
    const sameKindCount = floorElements.filter((item) => item.kind === template.kind).length;
    const stagger = (sameKindCount % 6) * 3;
    const nextElement: PlanElement = {
      id: makeId(template.kind),
      floor,
      kind: template.kind,
      x: clamp(39 + stagger, 2, 98 - template.width),
      y: clamp(36 + stagger, 2, 98 - template.height),
      width: template.width,
      height: template.height,
      rotation: 0,
      label: template.id === "exit" ? "Выход" : `${template.label} ${sameKindCount + 1}`,
      shape: template.shape,
      color: template.color,
      zIndex: clamp(Math.max(0, ...floorElements.map((item) => item.zIndex ?? 0)) + 1, -10_000, 10_000),
      locked: false,
      ...(template.kind === "table" ? { seats: template.seats ?? 4 } : {}),
      ...(template.kind === "camera" ? { viewAngle: 70, viewRadius: 28, viewEnabled: true } : {}),
    };
    const next = [...elementsRef.current, nextElement];
    setSelectedElementIds([nextElement.id]);
    setInspectorVisible(true);
    onSelectZone("");
    publish(next, true);
    requestAnimationFrame(() => document.getElementById(`plan-element-${nextElement.id}`)?.focus());
  };

  const updateSelected = (patch: Partial<PlanElement>, commit = false) => {
    if (!selectedElementId || !selectedElement) return;
    const next = elementsRef.current.map((item) => item.id === selectedElementId ? { ...item, ...patch } : item);
    publish(next, commit);
  };

  const beginPropertyEdit = () => {
    if (propertyEditingRef.current) return;
    propertyEditingRef.current = true;
    pushHistory();
  };

  const finishPropertyEdit = () => {
    if (!propertyEditingRef.current) return;
    propertyEditingRef.current = false;
    publish(elementsRef.current, true);
  };

  const deleteSelected = () => {
    if (!selectedElementIds.length && !effectiveSelectedZoneIds.length) return;
    const selected = new Set(selectedElementIds);
    const next = selected.size ? elementsRef.current.filter((item) => !selected.has(item.id)) : elementsRef.current;
    if (selected.size) {
      pushHistory();
      publish(next, true);
    }
    if (effectiveSelectedZoneIds.length && onDeleteZones) void onDeleteZones(effectiveSelectedZoneIds);
    setSelectedElementIds([]);
    setSelectedZoneIds([]);
    onSelectZone("");
    boardRef.current?.focus();
  };

  const duplicateSelected = () => {
    const originals = floorElements.filter((item) => selectedElementIds.includes(item.id));
    if (!originals.length) return;
    pushHistory();
    const topLayer = Math.max(0, ...floorElements.map((item) => item.zIndex ?? 0));
    const duplicates = originals.map((item, index): PlanElement => ({
      ...item,
      id: makeId(item.kind),
      x: quantize(clamp(item.x + 3, 0, 100 - item.width)),
      y: quantize(clamp(item.y + 3, 0, 100 - item.height)),
      label: `${item.label} · копия`,
      zIndex: clamp(topLayer + index + 1, -10_000, 10_000),
    }));
    const next = [...elementsRef.current, ...duplicates];
    setSelectedElementIds(duplicates.map((item) => item.id));
    setInspectorVisible(true);
    publish(next, true);
  };

  const copySelected = () => {
    clipboardRef.current = cloneElements(floorElements.filter((item) => selectedElementIds.includes(item.id)));
  };

  const pasteClipboard = () => {
    if (!clipboardRef.current.length) return;
    pushHistory();
    const topLayer = Math.max(0, ...floorElements.map((item) => item.zIndex ?? 0));
    const pasted = clipboardRef.current.map((item, index): PlanElement => ({
      ...item,
      id: makeId(item.kind),
      floor,
      x: quantize(clamp(item.x + 3, 0, 100 - item.width)),
      y: quantize(clamp(item.y + 3, 0, 100 - item.height)),
      zIndex: clamp(topLayer + index + 1, -10_000, 10_000),
    }));
    clipboardRef.current = cloneElements(pasted);
    setSelectedElementIds(pasted.map((item) => item.id));
    setInspectorVisible(true);
    publish([...elementsRef.current, ...pasted], true);
  };

  const rotateSelected = (delta = 15) => {
    if (!selectedElement) return;
    pushHistory();
    updateSelected({ rotation: (selectedElement.rotation + delta + 360) % 360 }, true);
  };

  const changeLayer = (direction: "front" | "back") => {
    if (!selectedElement) return;
    pushHistory();
    const layerValues = floorElements.map((item) => item.zIndex ?? 0);
    updateSelected({ zIndex: clamp(direction === "front" ? Math.max(0, ...layerValues) + 1 : Math.min(0, ...layerValues) - 1, -10_000, 10_000) }, true);
  };

  const startInteraction = (event: PointerEvent<HTMLElement>, item: PlanElement, mode: DragState["mode"]) => {
    if (readOnly || event.button !== 0 || !contentRef.current || item.locked) return;
    event.stopPropagation();
    if (event.shiftKey) {
      return;
    }
    const activeIds = selectedElementIds.includes(item.id) ? selectedElementIds : [item.id];
    pushHistory();
    setSelectedElementIds(activeIds);
    setInspectorVisible(true);
    onSelectZone("");
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      id: item.id,
      origins: Object.fromEntries(elementsRef.current.filter((candidate) => activeIds.includes(candidate.id)).map((candidate) => [candidate.id, {
        x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height,
      }])),
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
      startHeight: item.height,
      moved: false,
    };
  };

  const moveInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    const content = contentRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !content) return;
    const rect = content.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - interaction.startClientY) / rect.height) * 100;
    if (Math.abs(deltaX) > 0.08 || Math.abs(deltaY) > 0.08) interaction.moved = true;
    const next = elementsRef.current.map((item) => {
      const origin = interaction.origins[item.id];
      if (!origin || item.locked) return item;
      if (interaction.mode === "resize") {
        if (item.id !== interaction.id) return item;
        return {
          ...item,
          width: quantize(clamp(origin.width + deltaX, item.kind === "wall" ? 1 : 2, 100 - item.x)),
          height: quantize(clamp(origin.height + deltaY, item.kind === "wall" ? 0.8 : 2, 100 - item.y)),
        };
      }
      return {
        ...item,
        x: quantize(clamp(origin.x + deltaX, 0, 100 - item.width)),
        y: quantize(clamp(origin.y + deltaY, 0, 100 - item.height)),
      };
    });
    publish(next);
  };

  const pointInBoard = (event: PointerEvent<HTMLElement>) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const startSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const point = pointInBoard(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = { pointerId: event.pointerId, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, additive: event.shiftKey };
    selectionRef.current = box;
    setSelectionBox(box);
    if (!event.shiftKey) {
      setSelectedElementIds([]);
      setSelectedZoneIds([]);
    }
    onSelectZone("");
    boardRef.current?.focus();
  };

  const moveSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = selectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointInBoard(event);
    if (!point) return;
    const next = { ...current, currentX: point.x, currentY: point.y };
    selectionRef.current = next;
    setSelectionBox(next);
  };

  const finishSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = selectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const left = Math.min(current.startX, current.currentX);
    const right = Math.max(current.startX, current.currentX);
    const top = Math.min(current.startY, current.currentY);
    const bottom = Math.max(current.startY, current.currentY);
    const moved = right - left > 0.3 || bottom - top > 0.3;
    if (moved) {
      const boardRect = boardRef.current?.getBoundingClientRect();
      const contentRect = contentRef.current?.getBoundingClientRect();
      const contentLeft = boardRect && contentRect ? ((contentRect.left - boardRect.left) / boardRect.width) * 100 : 0;
      const contentTop = boardRect && contentRect ? ((contentRect.top - boardRect.top) / boardRect.height) * 100 : 0;
      const contentWidth = boardRect && contentRect ? (contentRect.width / boardRect.width) * 100 : 100;
      const contentHeight = boardRect && contentRect ? (contentRect.height / boardRect.height) * 100 : 100;
      const intersects = (x: number, y: number, width: number, height: number) => {
        const itemLeft = contentLeft + x * contentWidth / 100;
        const itemTop = contentTop + y * contentHeight / 100;
        const itemRight = itemLeft + width * contentWidth / 100;
        const itemBottom = itemTop + height * contentHeight / 100;
        return itemLeft < right && itemRight > left && itemTop < bottom && itemBottom > top;
      };
      const hits = floorElements.filter((item) => intersects(item.x, item.y, item.width, item.height)).map((item) => item.id);
      const zoneHits = canvasZones.filter((zone) => intersects(zone.left, zone.top, zone.width, zone.height)).map((zone) => zone.id);
      setSelectedElementIds((selected) => current.additive ? [...new Set([...selected, ...hits])] : hits);
      setSelectedZoneIds((selected) => current.additive ? [...new Set([...selected, ...zoneHits])] : zoneHits);
      onSelectZone(zoneHits.at(-1) ?? "");
      if (hits.length) setInspectorVisible(true);
    }
    selectionRef.current = null;
    setSelectionBox(null);
  };

  const finishInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    interactionRef.current = null;
    if (interaction.moved) publish(elementsRef.current, true);
    else {
      undoRef.current = undoRef.current.slice(0, -1);
      setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length });
    }
  };

  const startZoneInteraction = (event: PointerEvent<HTMLElement>, zone: PlanCanvasZone, mode: ZoneDragState["mode"]) => {
    if (readOnly || event.button !== 0 || !contentRef.current || !onZonesChange) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey && mode === "move") return;
    const activeIds = effectiveSelectedZoneIds.includes(zone.id) ? effectiveSelectedZoneIds : [zone.id];
    setSelectedElementIds([]);
    setSelectedZoneIds(activeIds);
    onSelectZone(zone.id);
    zoneInteractionRef.current = {
      id: zone.id,
      origins: Object.fromEntries(zonesRef.current.filter((candidate) => activeIds.includes(candidate.id)).map((candidate) => [candidate.id, {
        left: candidate.left,
        top: candidate.top,
        width: candidate.width,
        height: candidate.height,
      }])),
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
  };

  const moveZoneInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = zoneInteractionRef.current;
    const content = contentRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !content) return;
    const rect = content.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const rawDeltaX = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const rawDeltaY = ((event.clientY - interaction.startClientY) / rect.height) * 100;
    if (Math.abs(rawDeltaX) > 0.08 || Math.abs(rawDeltaY) > 0.08) interaction.moved = true;
    const origins = Object.values(interaction.origins);
    const deltaX = interaction.mode === "move"
      ? clamp(rawDeltaX, Math.max(...origins.map((item) => -item.left)), Math.min(...origins.map((item) => 100 - item.left - item.width)))
      : rawDeltaX;
    const deltaY = interaction.mode === "move"
      ? clamp(rawDeltaY, Math.max(...origins.map((item) => -item.top)), Math.min(...origins.map((item) => 100 - item.top - item.height)))
      : rawDeltaY;
    publishZones(zonesRef.current.map((item) => {
      const origin = interaction.origins[item.id];
      if (!origin) return item;
      if (interaction.mode === "resize") {
        if (item.id !== interaction.id) return item;
        return {
          ...item,
          width: quantize(clamp(origin.width + deltaX, 3, 100 - origin.left)),
          height: quantize(clamp(origin.height + deltaY, 3, 100 - origin.top)),
        };
      }
      return {
        ...item,
        left: quantize(origin.left + deltaX),
        top: quantize(origin.top + deltaY),
      };
    }));
  };

  const finishZoneInteraction = (event: PointerEvent<HTMLElement>) => {
    const interaction = zoneInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    zoneInteractionRef.current = null;
    suppressZoneClickRef.current = interaction.moved;
    if (interaction.moved) publishZones(zonesRef.current, true);
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (readOnly) return;
    if (event.key === "Escape" && (selectedElementIds.length || effectiveSelectedZoneIds.length)) {
      event.preventDefault();
      setSelectedElementIds([]);
      setSelectedZoneIds([]);
      onSelectZone("");
      return;
    }
    if (event.key === "Escape" && fullScreen) {
      event.preventDefault();
      setFullScreen(false);
      return;
    }
    const target = event.target as HTMLElement;
    if (target.matches("input, select, textarea")) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && event.code === "KeyY") {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.code === "KeyA") {
      event.preventDefault();
      setSelectedElementIds(floorElements.map((item) => item.id));
      setSelectedZoneIds(canvasZones.map((zone) => zone.id));
      onSelectZone(canvasZones.at(-1)?.id ?? "");
      if (floorElements.length) setInspectorVisible(true);
      return;
    }
    if (modifier && event.code === "KeyC" && selectedElementIds.length) {
      event.preventDefault();
      copySelected();
      return;
    }
    if (modifier && event.code === "KeyV") {
      event.preventDefault();
      pasteClipboard();
      return;
    }
    if (modifier && event.code === "KeyS") {
      event.preventDefault();
      publish(elementsRef.current, true);
      return;
    }
    if (modifier && event.code === "KeyD" && selectedElementIds.length) {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (!selectedElementIds.length && !effectiveSelectedZoneIds.length) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const amount = event.shiftKey ? 2 : snapToGrid ? 0.5 : 0.1;
    if (!selectedElementIds.length && effectiveSelectedZoneIds.length && onZonesChange) {
      const selectedZones = new Set(effectiveSelectedZoneIds);
      const active = zonesRef.current.filter((item) => selectedZones.has(item.id));
      const requestedX = move[0] * amount;
      const requestedY = move[1] * amount;
      const deltaX = clamp(requestedX, Math.max(...active.map((item) => -item.left)), Math.min(...active.map((item) => 100 - item.left - item.width)));
      const deltaY = clamp(requestedY, Math.max(...active.map((item) => -item.top)), Math.min(...active.map((item) => 100 - item.top - item.height)));
      publishZones(zonesRef.current.map((item) => selectedZones.has(item.id) ? {
        ...item,
        left: rounded(item.left + deltaX),
        top: rounded(item.top + deltaY),
      } : item), true);
      return;
    }
    if (!selectedElementIds.length) return;
    pushHistory();
    const selected = new Set(selectedElementIds);
    publish(elementsRef.current.map((item) => selected.has(item.id) && !item.locked ? {
      ...item,
      x: rounded(clamp(item.x + move[0] * amount, 0, 100 - item.width)),
      y: rounded(clamp(item.y + move[1] * amount, 0, 100 - item.height)),
    } : item), true);
  };

  const numericPatch = (field: "x" | "y" | "width" | "height" | "rotation", rawValue: string) => {
    if (!selectedElement) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    if (field === "x") updateSelected({ x: rounded(clamp(value, 0, 100 - selectedElement.width)) });
    if (field === "y") updateSelected({ y: rounded(clamp(value, 0, 100 - selectedElement.height)) });
    if (field === "width") updateSelected({ width: rounded(clamp(value, selectedElement.kind === "wall" ? 1 : 2, 100 - selectedElement.x)) });
    if (field === "height") updateSelected({ height: rounded(clamp(value, selectedElement.kind === "wall" ? 0.8 : 2, 100 - selectedElement.y)) });
    if (field === "rotation") updateSelected({ rotation: clamp(value, -360, 360) });
  };

  const cameraViewPatch = (field: "viewAngle" | "viewRadius", rawValue: string) => {
    if (!selectedElement || selectedElement.kind !== "camera") return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateSelected({ [field]: rounded(clamp(value, field === "viewAngle" ? 20 : 5, field === "viewAngle" ? 160 : 60)) });
  };

  const tableSeatsPatch = (rawValue: string) => {
    if (!selectedElement || selectedElement.kind !== "table") return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateSelected({ seats: Math.round(clamp(value, 1, 50)) });
  };

  return (
    <section className={`plan-editor${fullScreen ? " is-fullscreen" : ""}${readOnly ? " is-readonly" : ""}`} aria-label={`${readOnly ? "Просмотр" : "Редактор"} плана, ${floor} этаж`} onKeyDown={readOnly ? undefined : handleEditorKeyDown}>
      {!readOnly && <header className="plan-editor__toolbar">
        <div className="plan-editor__history" role="group" aria-label="История изменений">
          <button type="button" disabled={!historyState.undo} onClick={undo} title="Отменить (Ctrl+Z)"><Undo2 /><span>Отменить</span></button>
          <button type="button" disabled={!historyState.redo} onClick={redo} title="Повторить (Ctrl+Y)"><Redo2 /><span>Повторить</span></button>
        </div>
        <div className="plan-editor__view-tools" role="group" aria-label="Настройки канваса">
          <button type="button" className={libraryVisible ? "is-active" : ""} onClick={() => setLibraryVisible((value) => !value)} title={libraryVisible ? "Скрыть библиотеку объектов" : "Показать библиотеку объектов"}>{libraryVisible ? <PanelLeftClose /> : <PanelLeftOpen />} Объекты</button>
          <button type="button" className={inspectorVisible ? "is-active" : ""} onClick={() => setInspectorVisible((value) => !value)} title={inspectorVisible ? "Скрыть свойства" : "Показать свойства"}>{inspectorVisible ? <PanelRightClose /> : <PanelRightOpen />} Свойства</button>
          <button type="button" className={gridVisible ? "is-active" : ""} onClick={() => setGridVisible((value) => !value)} title="Показать или скрыть сетку"><Grid3X3 /> Сетка</button>
          {backgroundImageUrl && <button type="button" className={photoVisible ? "is-active" : ""} onClick={() => setPhotoVisible((value) => !value)} title={photoVisible ? "Скрыть фото-подложку" : "Показать фото-подложку"}>{photoVisible ? <ImageIcon /> : <ImageOff />} Фото</button>}
          <button type="button" className={snapToGrid ? "is-active" : ""} onClick={() => setSnapToGrid((value) => !value)} title="Привязка с шагом 0,5%"><MagnetIcon /> Привязка</button>
          <button type="button" className={cameraViewsVisible ? "is-active" : ""} onClick={() => setCameraViewsVisible((value) => !value)} title="Показать или скрыть секторы обзора камер"><Eye /> Обзор камер</button>
          <button type="button" className={fullScreen ? "is-active" : ""} onClick={() => setFullScreen((value) => !value)} title={fullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть редактор на весь экран"}>{fullScreen ? <Minimize2 /> : <Maximize2 />} {fullScreen ? "Свернуть" : "На весь экран"}</button>
          <span className="plan-editor__zoom">
            <button type="button" disabled={zoom <= 75} onClick={() => setZoom((value) => Math.max(75, value - 25))} aria-label="Уменьшить масштаб"><ZoomOut /></button>
            <b>{zoom}%</b>
            <button type="button" disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 25))} aria-label="Увеличить масштаб"><ZoomIn /></button>
          </span>
        </div>
        <div className="plan-editor__save-state" aria-live="polite"><Save />{savedAt ? `Сохранено ${savedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Автосохранение включено"}</div>
      </header>}

      <div className={`plan-editor__workspace${!readOnly && libraryVisible ? "" : " is-library-hidden"}${!readOnly && inspectorVisible ? "" : " is-inspector-hidden"}`}>
        {!readOnly && libraryVisible && <aside className="plan-editor__library" aria-label="Библиотека объектов">
          <div className="plan-editor__library-tabs" role="tablist" aria-label="Содержимое плана">
            <button role="tab" aria-selected={libraryTab === "objects"} className={libraryTab === "objects" ? "active" : ""} onClick={() => setLibraryTab("objects")}><Square /> Объекты</button>
            <button role="tab" aria-selected={libraryTab === "zones"} className={libraryTab === "zones" ? "active" : ""} onClick={() => setLibraryTab("zones")}><MapPin /> Зоны <b>{canvasZones.length}</b></button>
          </div>
          {libraryTab === "objects" && GROUPS.map((group) => (
            <div className="plan-editor__library-group" key={group}>
              <h3>{group}</h3>
              {LIBRARY.filter((item) => item.group === group).map((item) => (
                <button type="button" key={item.id} onClick={() => addElement(item)}>
                  <i><KindIcon kind={item.kind} shape={item.shape} /></i>
                  <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                  <Plus />
                </button>
              ))}
            </div>
          ))}
          {libraryTab === "zones" && <div className="plan-editor__library-group plan-editor__zone-library">
            <button className="plan-editor__zone-create" type="button" onClick={onCreateZone} disabled={!onCreateZone}>
              <i><Plus /></i>
              <span><strong>Создать зону</strong><small>Зал, бар, кухня или проход</small></span>
              <Plus />
            </button>
            {canvasZones.map((zone) => (
              <button
                className={effectiveSelectedZoneIds.includes(zone.id) ? "is-active" : ""}
                type="button"
                key={zone.id}
                onClick={() => {
                  setSelectedElementIds([]);
                  setSelectedZoneIds([zone.id]);
                  onSelectZone(zone.id);
                  setInspectorVisible(true);
                }}
              >
                <i><MapPin /></i>
                <span><strong>{zone.name}</strong><small>{zone.capacity} мест · {zone.coverage}% покрытия</small></span>
                <SlidersHorizontal />
              </button>
            ))}
            {canvasZones.length === 0 && <p className="plan-editor__zones-empty">Зон пока нет — создайте первую.</p>}
          </div>}
        </aside>}

        <div className="plan-editor__canvas-column">
          <div className="plan-editor__stage-shell">
            <div
              ref={boardRef}
              className="plan-editor__stage"
              style={{ width: `${zoom}%`, minHeight: `${Math.round(520 * (zoom / 100))}px` }}
              tabIndex={readOnly ? -1 : 0}
              onPointerDown={readOnly ? undefined : startSelection}
              onPointerMove={readOnly ? undefined : moveSelection}
              onPointerUp={readOnly ? undefined : finishSelection}
              onPointerCancel={readOnly ? undefined : finishSelection}
              aria-label="Рабочая область плана. Выберите объект и перемещайте стрелками или перетаскиванием."
            >
              {gridVisible && <div className="plan-editor__grid" aria-hidden="true" />}
              <div
                ref={contentRef}
                className={`plan-editor__content-layer${backgroundImageUrl ? " has-image" : ""}${backgroundMode === "camera-view" ? " is-camera-view" : ""}`}
                onPointerMove={readOnly ? undefined : moveZoneInteraction}
                onPointerUp={readOnly ? undefined : finishZoneInteraction}
                onPointerCancel={readOnly ? undefined : finishZoneInteraction}
                style={{
                  "--plan-image-ratio": backgroundAspectRatio ?? 1,
                  width: backgroundImageUrl && backgroundAspectRatio && backgroundAspectRatio < stageAspectRatio ? `${(backgroundAspectRatio / stageAspectRatio) * 100}%` : "100%",
                  height: backgroundImageUrl && backgroundAspectRatio && backgroundAspectRatio >= stageAspectRatio ? `${(stageAspectRatio / backgroundAspectRatio) * 100}%` : "100%",
                  backgroundImage: photoVisible && backgroundImageUrl ? `url(${JSON.stringify(backgroundImageUrl)})` : undefined,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 100%",
                } as CSSProperties}
              >
              {backgroundMode === "camera-view" && (
                <div className="plan-editor__camera-view-mode" role="note">
                  <Camera aria-hidden="true" />
                  <span><strong>Вид камеры</strong><small>Зоны — области кадра, не метры на плане</small></span>
                </div>
              )}
              {backgroundImageUrl && (
                // The protected same-origin asset needs the browser auth cookie, so a raw image is intentional here.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={backgroundImageUrl}
                  className="plan-editor__background-probe"
                  src={backgroundImageUrl}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth && image.naturalHeight) setBackgroundAspectRatio(image.naturalWidth / image.naturalHeight);
                  }}
                />
              )}
              {planFileName && planSource === "pdf" && !backgroundImageUrl && (
                <div className="plan-editor__plan-reference" aria-hidden="true"><span>Подложка плана</span><strong>{planFileName}</strong></div>
              )}

              {cameraViewsVisible && (
                <svg className="plan-editor__camera-views" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {floorElements.filter((item) => item.kind === "camera" && item.viewEnabled !== false).map((item) => (
                    <path
                      key={`view-${item.id}`}
                      className={selectedElementIds.includes(item.id) ? "is-selected" : ""}
                      d={cameraViewPath(item)}
                      style={{ "--camera-view-color": item.color ?? "#2e88b3" } as CSSProperties}
                    />
                  ))}
                </svg>
              )}

              {canvasZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={`plan-editor__zone${effectiveSelectedZoneIds.includes(zone.id) ? " is-selected" : ""}${zone.coverage < 75 ? " is-warning" : ""}`}
                  style={{ left: `${zone.left}%`, top: `${zone.top}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
                  onPointerDown={readOnly ? undefined : (event) => startZoneInteraction(event, zone, "move")}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (readOnly) return;
                    if (suppressZoneClickRef.current) {
                      suppressZoneClickRef.current = false;
                      return;
                    }
                    setSelectedElementIds([]);
                    if (event.shiftKey) {
                      setSelectedZoneIds((current) => {
                        const next = current.includes(zone.id) ? current.filter((id) => id !== zone.id) : [...current, zone.id];
                        onSelectZone(next.at(-1) ?? "");
                        return next;
                      });
                    } else {
                      setSelectedZoneIds([zone.id]);
                      onSelectZone(zone.id);
                    }
                  }}
                  aria-pressed={effectiveSelectedZoneIds.includes(zone.id)}
                  aria-label={`${zone.name}, вместимость ${zone.capacity}, покрытие ${zone.coverage}%`}
                >
                  <strong>{zone.name}</strong><span>{zone.capacity} мест · {zone.coverage}%</span>
                  {!readOnly && effectiveSelectedZoneIds.length === 1 && effectiveSelectedZoneIds.includes(zone.id) && onZonesChange && (
                    <span
                      className="plan-editor__zone-resize-handle"
                      aria-hidden="true"
                      onPointerDown={(event) => startZoneInteraction(event, zone, "resize")}
                    ><Grip /></span>
                  )}
                </button>
              ))}

              {backgroundMode === "camera-view" && (
                <div className="plan-editor__viewpoint-anchor" aria-label="Точка съёмки камеры расположена снизу по центру кадра">
                  <Camera aria-hidden="true" /><span>Точка съёмки</span>
                </div>
              )}

              {floorElements.map((item) => {
                const selected = selectedElementIds.includes(item.id);
                return (
                  <button
                    id={`plan-element-${item.id}`}
                    key={item.id}
                    type="button"
                    className={`plan-editor__element plan-editor__element--${item.kind} shape-${item.shape ?? "rectangle"}${selected ? " is-selected" : ""}${item.locked ? " is-locked" : ""}`}
                    style={{
                      left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%`,
                      transform: `rotate(${item.rotation}deg)`,
                      zIndex: selected ? 1000 : Math.max(2, 10 + (item.zIndex ?? 0)),
                      "--element-color": item.color ?? "#5f746b",
                    } as CSSProperties}
                    aria-pressed={selected}
                    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete Control+D"
                    aria-label={`${KIND_LABELS[item.kind]}: ${item.label}${item.kind === "table" ? `, ${tableSeatCount(item)} мест` : ""}. Координаты ${Math.round(item.x)}, ${Math.round(item.y)}`}
                    title={`${item.label}${item.locked ? " · заблокировано" : " · перетащите или используйте стрелки"}`}
                    onPointerDown={readOnly ? undefined : (event) => startInteraction(event, item, "move")}
                    onPointerMove={readOnly ? undefined : moveInteraction}
                    onPointerUp={readOnly ? undefined : finishInteraction}
                    onPointerCancel={readOnly ? undefined : finishInteraction}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (readOnly) return;
                      if (event.shiftKey) setSelectedElementIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                      else if (!selectedElementIds.includes(item.id)) setSelectedElementIds([item.id]);
                      if (!event.shiftKey) setSelectedZoneIds([]);
                      setInspectorVisible(true);
                      onSelectZone("");
                    }}
                  >
                    <KindIcon kind={item.kind} shape={item.shape} />
                    {item.kind === "table" && <b className="plan-editor__table-seats" title={`${tableSeatCount(item)} мест`}>{tableSeatCount(item)} м.</b>}
                    {item.kind !== "wall" && item.kind !== "door" && <span>{item.label}</span>}
                    {item.locked && <Lock className="plan-editor__lock-mark" aria-hidden="true" />}
                    {!readOnly && selected && !item.locked && (
                      <span
                        className="plan-editor__resize-handle"
                        onPointerDown={(event) => startInteraction(event, item, "resize")}
                        onPointerMove={moveInteraction}
                        onPointerUp={finishInteraction}
                        onPointerCancel={finishInteraction}
                      ><Grip /></span>
                    )}
                  </button>
                );
              })}

              {!backgroundImageUrl && (planSource === "manual" || !planFileName) && canvasZones.length === 0 && floorElements.length === 0 && (
                <div className="plan-editor__empty"><MousePointer2 /><strong>Начните собирать план</strong><span>Выберите объект слева. Затем настройте размер и подпись в инспекторе справа.</span></div>
              )}
              </div>
              {selectionBox && <div className="plan-editor__selection-box" style={{
                left: `${Math.min(selectionBox.startX, selectionBox.currentX)}%`,
                top: `${Math.min(selectionBox.startY, selectionBox.currentY)}%`,
                width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}%`,
                height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}%`,
              }} aria-hidden="true" />}
            </div>
          </div>
          {!readOnly && <div className="plan-editor__canvas-hint"><MousePointer2 /> Рамка мышью — выделить · <kbd>Shift</kbd> + клик — добавить · <kbd>Ctrl</kbd> + <kbd>C/V</kbd> — копировать · <kbd>Del</kbd> — удалить</div>}
        </div>

        {!readOnly && inspectorVisible && <aside className="plan-editor__inspector" aria-label="Свойства объекта">
          <div className="plan-editor__panel-title"><SlidersHorizontal /><span><strong>Свойства</strong><small>{selectedElementIds.length + effectiveSelectedZoneIds.length > 1 ? `Выбрано ${selectedElementIds.length + effectiveSelectedZoneIds.length} элементов` : effectiveSelectedZoneIds.length ? "Выбрана зона" : selectedElement ? KIND_LABELS[selectedElement.kind] : "Объект не выбран"}</small></span></div>
          {selectedElement ? (
            <div className="plan-editor__property-form">
              <label>Название<input value={selectedElement.label} maxLength={160} onFocus={beginPropertyEdit} onChange={(event) => updateSelected({ label: event.target.value })} onBlur={finishPropertyEdit} /></label>
              {selectedElement.kind === "camera" && <label>Зал<input value={selectedCameraZone?.name ?? "Вне зала"} readOnly /><small>Определяется автоматически по положению камеры внутри зоны.</small></label>}
              <div className="plan-editor__field-grid">
                <label>X, %<input type="number" step="0.5" min="0" max="100" value={rounded(selectedElement.x)} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("x", event.target.value)} onBlur={finishPropertyEdit} /></label>
                <label>Y, %<input type="number" step="0.5" min="0" max="100" value={rounded(selectedElement.y)} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("y", event.target.value)} onBlur={finishPropertyEdit} /></label>
                <label>Ширина, %<input type="number" step="0.5" min="1" max="100" value={rounded(selectedElement.width)} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("width", event.target.value)} onBlur={finishPropertyEdit} /></label>
                <label>Высота, %<input type="number" step="0.5" min="0.8" max="100" value={rounded(selectedElement.height)} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("height", event.target.value)} onBlur={finishPropertyEdit} /></label>
              </div>
              <label>Поворот, °<div className="plan-editor__range-field"><input type="range" min="0" max="345" step="15" value={(selectedElement.rotation + 360) % 360} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("rotation", event.target.value)} onBlur={finishPropertyEdit} /><input type="number" min="-360" max="360" step="15" value={selectedElement.rotation} onFocus={beginPropertyEdit} onChange={(event) => numericPatch("rotation", event.target.value)} onBlur={finishPropertyEdit} /></div></label>
              {selectedElement.kind === "camera" && <div className="plan-editor__camera-settings">
                <strong><Eye /> Сектор обзора</strong>
                <button className={`plan-editor__lock-toggle${selectedElement.viewEnabled !== false ? " is-active" : ""}`} type="button" onClick={() => { pushHistory(); updateSelected({ viewEnabled: selectedElement.viewEnabled === false }, true); }}>{selectedElement.viewEnabled !== false ? "Обзор отображается" : "Обзор скрыт"}</button>
                <label>Угол обзора, °<div className="plan-editor__range-field"><input type="range" min="20" max="160" step="5" value={selectedElement.viewAngle ?? 70} onFocus={beginPropertyEdit} onChange={(event) => cameraViewPatch("viewAngle", event.target.value)} onBlur={finishPropertyEdit} /><input type="number" min="20" max="160" step="5" value={selectedElement.viewAngle ?? 70} onFocus={beginPropertyEdit} onChange={(event) => cameraViewPatch("viewAngle", event.target.value)} onBlur={finishPropertyEdit} /></div></label>
                <label>Дальность на плане, %<div className="plan-editor__range-field"><input type="range" min="5" max="60" step="1" value={selectedElement.viewRadius ?? 28} onFocus={beginPropertyEdit} onChange={(event) => cameraViewPatch("viewRadius", event.target.value)} onBlur={finishPropertyEdit} /><input type="number" min="5" max="60" step="1" value={selectedElement.viewRadius ?? 28} onFocus={beginPropertyEdit} onChange={(event) => cameraViewPatch("viewRadius", event.target.value)} onBlur={finishPropertyEdit} /></div></label>
                <small>Направление меняется ползунком «Поворот» выше.</small>
              </div>}
              {selectedElement.kind === "table" && <>
                <label className="plan-editor__seat-field">Количество мест<input type="number" min="1" max="50" step="1" value={tableSeatCount(selectedElement)} onFocus={beginPropertyEdit} onChange={(event) => tableSeatsPatch(event.target.value)} onBlur={finishPropertyEdit} /></label>
                <label>Форма<select value={selectedElement.shape ?? "rectangle"} onChange={(event) => { pushHistory(); updateSelected({ shape: event.target.value as ElementShape }, true); }}><option value="rectangle">Прямоугольная</option><option value="round">Круглая</option></select></label>
              </>}
              <label>Цвет<div className="plan-editor__color-field"><input type="color" value={selectedElement.color ?? "#5f746b"} onFocus={beginPropertyEdit} onChange={(event) => updateSelected({ color: event.target.value })} onBlur={finishPropertyEdit} /><input value={selectedElement.color ?? "#5f746b"} readOnly tabIndex={-1} aria-label="Код цвета" /></div></label>
              <button className={`plan-editor__lock-toggle${selectedElement.locked ? " is-active" : ""}`} type="button" onClick={() => { pushHistory(); updateSelected({ locked: !selectedElement.locked }, true); }}>{selectedElement.locked ? <Lock /> : <Unlock />}{selectedElement.locked ? "Разблокировать объект" : "Заблокировать объект"}</button>
              <div className="plan-editor__layer-actions"><span><Layers3 /> Слой</span><button type="button" onClick={() => changeLayer("front")}>На передний план</button><button type="button" onClick={() => changeLayer("back")}>На задний план</button></div>
              <div className="plan-editor__object-actions">
                <button type="button" onClick={() => rotateSelected(15)}><RotateCw /> Повернуть</button>
                <button type="button" onClick={duplicateSelected}><Copy /> Дублировать</button>
                <button className="danger" type="button" onClick={deleteSelected}><Trash2 /> Удалить</button>
              </div>
            </div>
          ) : selectedPlanZone ? (
            <div className="plan-editor__property-form plan-editor__zone-properties">
              <label>Название зоны<input value={selectedPlanZone.name} maxLength={100} onChange={(event) => updateSelectedZone({ name: event.target.value })} onBlur={commitSelectedZone} /></label>
              <label>Тип<input value={selectedPlanZone.type ?? "Dining"} maxLength={80} onChange={(event) => updateSelectedZone({ type: event.target.value })} onBlur={commitSelectedZone} /></label>
              <label className="plan-editor__seat-field">Вместимость<input type="number" min="0" max="100000" step="1" value={selectedPlanZone.capacity} onChange={(event) => zoneNumericPatch("capacity", event.target.value)} onBlur={commitSelectedZone} /></label>
              <div className="plan-editor__field-grid">
                <label>X, %<input type="number" step="0.5" min="0" max="100" value={rounded(selectedPlanZone.left)} onChange={(event) => zoneNumericPatch("left", event.target.value)} onBlur={commitSelectedZone} /></label>
                <label>Y, %<input type="number" step="0.5" min="0" max="100" value={rounded(selectedPlanZone.top)} onChange={(event) => zoneNumericPatch("top", event.target.value)} onBlur={commitSelectedZone} /></label>
                <label>Ширина, %<input type="number" step="0.5" min="3" max="100" value={rounded(selectedPlanZone.width)} onChange={(event) => zoneNumericPatch("width", event.target.value)} onBlur={commitSelectedZone} /></label>
                <label>Высота, %<input type="number" step="0.5" min="3" max="100" value={rounded(selectedPlanZone.height)} onChange={(event) => zoneNumericPatch("height", event.target.value)} onBlur={commitSelectedZone} /></label>
              </div>
              <div className="plan-editor__zone-help"><MapPin /><span>Зону также можно перетащить на плане и растянуть за нижний правый угол.</span></div>
              <div className="plan-editor__object-actions">
                <button className="danger" type="button" onClick={() => void onDeleteZones?.([selectedPlanZone.id])}><Trash2 /> Удалить зону</button>
              </div>
            </div>
          ) : (
            <div className="plan-editor__inspector-empty"><Square /><strong>Выберите объект или зону</strong><span>Здесь появятся точные размеры, координаты и свойства.</span></div>
          )}
        </aside>}
      </div>

      <footer className="plan-editor__footer">
        <span><MagnetIcon /> Шаг {snapToGrid ? "0,5%" : "свободный"}</span>
        <span><Grid3X3 /> Сетка {gridVisible ? "включена" : "скрыта"}</span>
        <span className="plan-editor__count"><MapPin /> {selectedElementIds.length + effectiveSelectedZoneIds.length ? `Выбрано ${selectedElementIds.length + effectiveSelectedZoneIds.length} · ` : ""}{planSource === "image" ? "Фото · " : planSource === "pdf" ? "PDF · " : "Ручной · "}{canvasZones.length} зон · {floorElements.length} объектов</span>
      </footer>
    </section>
  );
}

function MagnetIcon() {
  return <><Minus aria-hidden="true" /><Minus aria-hidden="true" /></>;
}
