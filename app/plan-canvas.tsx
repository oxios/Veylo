"use client";

import {
  Camera,
  DoorOpen,
  Grip,
  MapPin,
  MousePointer2,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Table2,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
};

export type PlanCanvasZone = {
  id: string;
  name: string;
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
  onElementsChange: (next: PlanElement[]) => void;
  onCommit: (next: PlanElement[]) => void;
  planFileName?: string;
};

type ElementKind = PlanElement["kind"];

type DragState = {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const KIND_META: Record<ElementKind, { label: string; itemLabel: string; width: number; height: number }> = {
  table: { label: "Стол", itemLabel: "Стол", width: 6.5, height: 8 },
  camera: { label: "Камера", itemLabel: "Камера", width: 5, height: 7 },
  wall: { label: "Стена", itemLabel: "Стена", width: 24, height: 2.2 },
  door: { label: "Дверь", itemLabel: "Дверь", width: 9, height: 3 },
  label: { label: "Подпись", itemLabel: "Подпись", width: 14, height: 6 },
};

const PALETTE: ElementKind[] = ["table", "camera", "wall", "door", "label"];

function KindIcon({ kind }: { kind: ElementKind }) {
  if (kind === "table") return <Table2 aria-hidden="true" />;
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

function makeId(kind: ElementKind) {
  if (globalThis.crypto?.randomUUID) return `${kind}-${globalThis.crypto.randomUUID()}`;
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PlanCanvas({
  floor,
  elements,
  zones,
  selectedZoneId,
  onSelectZone,
  onElementsChange,
  onCommit,
  planFileName,
}: PlanCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef(elements);
  const dragRef = useRef<DragState | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const floorElements = elements.filter((item) => item.floor === floor);
  const selectedElement = elements.find((item) => item.id === selectedElementId && item.floor === floor) ?? null;

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const publish = (next: PlanElement[], commit = false) => {
    elementsRef.current = next;
    onElementsChange(next);
    if (commit) onCommit(next);
  };

  const addElement = (kind: ElementKind) => {
    const meta = KIND_META[kind];
    const sameKindCount = floorElements.filter((item) => item.kind === kind).length;
    const stagger = (sameKindCount % 5) * 3;
    const nextElement: PlanElement = {
      id: makeId(kind),
      floor,
      kind,
      x: clamp(44 + stagger, 2, 98 - meta.width),
      y: clamp(42 + stagger, 2, 98 - meta.height),
      width: meta.width,
      height: meta.height,
      rotation: 0,
      label: `${meta.itemLabel} ${sameKindCount + 1}`,
    };
    const next = [...elementsRef.current, nextElement];
    setSelectedElementId(nextElement.id);
    onSelectZone("");
    publish(next, true);
    requestAnimationFrame(() => document.getElementById(`plan-element-${nextElement.id}`)?.focus());
  };

  const deleteSelected = () => {
    if (!selectedElementId || !selectedElement) return;
    const next = elementsRef.current.filter((item) => item.id !== selectedElementId);
    setSelectedElementId(null);
    publish(next, true);
    boardRef.current?.focus();
  };

  const rotateSelected = () => {
    if (!selectedElementId || !selectedElement) return;
    const next = elementsRef.current.map((item) => item.id === selectedElementId
      ? { ...item, rotation: (item.rotation + 15) % 360 }
      : item);
    publish(next, true);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, item: PlanElement) => {
    if (event.button !== 0 || !boardRef.current) return;
    event.stopPropagation();
    setSelectedElementId(item.id);
    onSelectZone("");
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: item.x,
      startY: item.y,
      moved: false,
    };
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !board) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startClientY) / rect.height) * 100;
    if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) drag.moved = true;
    const next = elementsRef.current.map((item) => item.id === drag.id
      ? {
          ...item,
          x: rounded(clamp(drag.startX + deltaX, 0, 100 - item.width)),
          y: rounded(clamp(drag.startY + deltaY, 0, 100 - item.height)),
        }
      : item);
    publish(next);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (drag.moved) onCommit(elementsRef.current);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedElementId || !selectedElement) return;
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
    const amount = event.shiftKey ? 2 : 0.5;
    const next = elementsRef.current.map((item) => item.id === selectedElementId
      ? {
          ...item,
          x: rounded(clamp(item.x + move[0] * amount, 0, 100 - item.width)),
          y: rounded(clamp(item.y + move[1] * amount, 0, 100 - item.height)),
        }
      : item);
    publish(next, true);
  };

  return (
    <section className="plan-editor" aria-label={`Редактор плана, ${floor} этаж`}>
      <header className="plan-editor__toolbar">
        <div className="plan-editor__palette" role="group" aria-label="Добавить объект на план">
          <span><Plus aria-hidden="true" /> Добавить</span>
          {PALETTE.map((kind) => (
            <button key={kind} type="button" onClick={() => addElement(kind)} aria-label={`Добавить: ${KIND_META[kind].label.toLocaleLowerCase("ru")}`}>
              <KindIcon kind={kind} />
              {KIND_META[kind].label}
            </button>
          ))}
        </div>
        <div className="plan-editor__actions" role="group" aria-label="Действия с выбранным объектом">
          <button type="button" disabled={!selectedElement} onClick={rotateSelected} title="Повернуть на 15 градусов">
            <RotateCw aria-hidden="true" />
            <span>Повернуть</span>
          </button>
          <button className="danger" type="button" disabled={!selectedElement} onClick={deleteSelected}>
            <Trash2 aria-hidden="true" />
            <span>Удалить</span>
          </button>
        </div>
      </header>

      <div className="plan-editor__stage-shell">
        <div
          ref={boardRef}
          className="plan-editor__stage"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setSelectedElementId(null);
            onSelectZone("");
          }}
          aria-label="Рабочая область плана. Выберите объект и перемещайте стрелками или перетаскиванием."
        >
          <div className="plan-editor__grid" aria-hidden="true" />
          {planFileName && (
            <div className="plan-editor__plan-reference" aria-hidden="true">
              <span>Подложка плана</span>
              <strong>{planFileName}</strong>
            </div>
          )}

          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`plan-editor__zone${selectedZoneId === zone.id ? " is-selected" : ""}${zone.coverage < 75 ? " is-warning" : ""}`}
              style={{ left: `${zone.left}%`, top: `${zone.top}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedElementId(null);
                onSelectZone(zone.id);
              }}
              aria-pressed={selectedZoneId === zone.id}
              aria-label={`${zone.name}, вместимость ${zone.capacity}, покрытие ${zone.coverage}%`}
            >
              <strong>{zone.name}</strong>
              <span>{zone.capacity} мест · {zone.coverage}%</span>
            </button>
          ))}

          {floorElements.map((item) => (
            <button
              id={`plan-element-${item.id}`}
              key={item.id}
              type="button"
              className={`plan-editor__element plan-editor__element--${item.kind}${selectedElementId === item.id ? " is-selected" : ""}`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}%`,
                height: `${item.height}%`,
                transform: `rotate(${item.rotation}deg)`,
              }}
              aria-pressed={selectedElementId === item.id}
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete"
              aria-label={`${KIND_META[item.kind].label}: ${item.label}. Координаты ${Math.round(item.x)}, ${Math.round(item.y)}`}
              title={`${item.label} · перетащите или используйте стрелки`}
              onPointerDown={(event) => startDrag(event, item)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onClick={(event) => event.stopPropagation()}
            >
              <KindIcon kind={item.kind} />
              {item.kind !== "wall" && item.kind !== "door" && <span>{item.label}</span>}
              {selectedElementId === item.id && <Grip className="plan-editor__grip" aria-hidden="true" />}
            </button>
          ))}

          {!planFileName && zones.length === 0 && floorElements.length === 0 && (
            <div className="plan-editor__empty">
              <MousePointer2 aria-hidden="true" />
              <strong>План пока пуст</strong>
              <span>Добавьте объекты с панели сверху или загрузите PDF-план.</span>
            </div>
          )}
        </div>
      </div>

      <footer className="plan-editor__footer">
        <span><MousePointer2 aria-hidden="true" /> Перетаскивайте объекты мышью или касанием</span>
        <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> точное перемещение</span>
        <span className="plan-editor__count"><MapPin aria-hidden="true" /> {zones.length} зон · {floorElements.length} объектов</span>
      </footer>
    </section>
  );
}
