"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import { Table2 } from "lucide-react";
import { CameraFrame } from "./camera-ui";
import { formatPercent } from "./format";
import type { Camera, Heatmap } from "./types";

export type Series = { key: string; label: string; tone: "s1" | "s2" | "s3"; values: (number | null)[] };

function niceMax(value: number) {
  if (value <= 1) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((item) => item * exponent >= value) ?? 10;
  return step * exponent;
}

const formatValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * Bars on one axis. Two series are stacked (parts of one whole, e.g. walked in + walked past).
 * null = no coverage (hatched gap), future buckets stay blank.
 */
export function BarChart({ eyebrow, title, labels, tooltipLabels, series, unit, future = [], tickEvery = 1, note }: {
  eyebrow: string;
  title: string;
  labels: string[];
  tooltipLabels?: string[];
  series: Series[];
  unit: string;
  future?: boolean[];
  tickEvery?: number;
  note?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = labels.map((_, index) => {
    const values = series.map((item) => item.values[index]);
    return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  });
  const max = niceMax(Math.max(0, ...totals.map((value) => value ?? 0)));
  const hovered = hover === null ? null : hover;
  const stacked = series.length > 1;

  return (
    <section className="card panel chart-card">
      <div className="panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <button type="button" className={`icon-button soft${table ? " on" : ""}`} aria-pressed={table} aria-label="Показати таблицею" title="Таблиця" onClick={() => setTable(!table)}><Table2 /></button>
      </div>
      {stacked && (
        <div className="chart-legend">
          {series.map((item) => <span key={item.key}><i className={`swatch ${item.tone}`} />{item.label}</span>)}
        </div>
      )}
      {table ? (
        <div className="table-wrap chart-table">
          <table className="video-table">
            <thead><tr><th>Період</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
            <tbody>
              {labels.map((label, index) => !future[index] && (
                <tr key={label + index}>
                  <td>{tooltipLabels?.[index] ?? label}</td>
                  {series.map((item) => <td key={item.key}>{item.values[index] === null ? "немає даних" : formatValue(item.values[index]!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="bar-chart">
            <div className="bar-axis" aria-hidden="true"><span>{formatValue(max)}</span><span>{formatValue(max / 2)}</span><span>0</span></div>
            <div className="bar-plot" onMouseLeave={() => setHover(null)}>
              <div className="bar-grid" aria-hidden="true"><i /><i /><i /></div>
              {labels.map((label, index) => {
                const total = totals[index];
                const gap = total === null && !future[index];
                return (
                  <button
                    type="button"
                    key={label + index}
                    className={`bar-slot${gap ? " empty" : ""}${future[index] ? " future" : ""}${hover === index ? " hover" : ""}`}
                    onMouseEnter={() => setHover(index)}
                    onFocus={() => setHover(index)}
                    onBlur={() => setHover(null)}
                    aria-label={`${tooltipLabels?.[index] ?? label}: ${total === null ? "немає даних" : series.map((item) => `${item.label} ${formatValue(item.values[index] ?? 0)}`).join(", ")}`}
                  >
                    {total === 0 && <span className="bar-zero" />}
                    {total !== null && total > 0 && (
                      <span className="bar-stack" style={{ height: `${(total / max) * 100}%` }}>
                        {series.map((item) => {
                          const value = item.values[index] ?? 0;
                          return value > 0 ? <i key={item.key} className={item.tone} style={{ flexGrow: value }} /> : null;
                        })}
                      </span>
                    )}
                  </button>
                );
              })}
              {hovered !== null && (
                <div className="bar-tooltip" style={{ left: `${((hovered + 0.5) / labels.length) * 100}%` }}>
                  <strong>{tooltipLabels?.[hovered] ?? labels[hovered]}</strong>
                  {totals[hovered] === null
                    ? <span>{future[hovered] ? "Ще не настав" : "Камера не аналізувалась"}</span>
                    : series.map((item) => (
                      <span key={item.key} className="tooltip-row">{stacked && <i className={`swatch ${item.tone}`} />}{item.label}: <b>{formatValue(item.values[hovered] ?? 0)}</b> {unit}</span>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="bar-labels" aria-hidden="true">
            {labels.map((label, index) => <span key={label + index}>{index % tickEvery === 0 ? label : ""}</span>)}
          </div>
        </>
      )}
      {note && <p className="footnote">{note}</p>}
    </section>
  );
}

// ---- heatmap over the camera frame ----

const LOW = [255, 190, 140];
const HIGH = [214, 64, 15];

// Paints a heatmap grid into a canvas (one pixel per cell; CSS scales it smoothly over the frame).
export function paintHeat(canvas: HTMLCanvasElement, heatmap: Heatmap, alpha = 1) {
  const { cols, rows, cells } = heatmap;
  const max = Math.max(0, ...cells);
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(cols, rows);
  cells.forEach((value, index) => {
    const k = max > 0 ? Math.sqrt(value / max) : 0;
    const offset = index * 4;
    image.data[offset] = LOW[0] + (HIGH[0] - LOW[0]) * k;
    image.data[offset + 1] = LOW[1] + (HIGH[1] - LOW[1]) * k;
    image.data[offset + 2] = LOW[2] + (HIGH[2] - LOW[2]) * k;
    image.data[offset + 3] = value > 0 ? Math.round(255 * (0.18 + 0.62 * k) * alpha) : 0;
  });
  ctx.putImageData(image, 0, 0);
}

export function HeatmapPanel({ camera, heatmap, eyebrow = "ХІТМАП", title = "Де люди проводили час", note }: {
  camera: Camera;
  heatmap: Heatmap;
  eyebrow?: string;
  title?: string;
  note?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; value: number } | null>(null);
  const max = Math.max(0, ...heatmap.cells);

  useEffect(() => {
    if (canvasRef.current) paintHeat(canvasRef.current, heatmap);
  }, [heatmap, max]);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;
    const col = Math.min(heatmap.cols - 1, Math.floor(fx * heatmap.cols));
    const row = Math.min(heatmap.rows - 1, Math.floor(fy * heatmap.rows));
    setHover({ x: fx, y: fy, value: heatmap.cells[row * heatmap.cols + col] ?? 0 });
  };

  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="heatmap" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Теплова карта присутності людей на кадрі">
        <CameraFrame camera={camera} className="heat-base" />
        {max > 0 ? <canvas ref={canvasRef} className="heat-layer" /> : <div className="heat-empty">За цей період людей у кадрі не було</div>}
        {hover && max > 0 && (
          <div className="heat-tooltip" style={{ left: `${hover.x * 100}%`, top: `${hover.y * 100}%` }}>
            {hover.value > 0 ? `≈ ${hover.value >= 60 ? `${Math.round(hover.value / 60)} людино-хв` : `${Math.round(hover.value)} людино-с`}` : "нікого"}
          </div>
        )}
      </div>
      <div className="heat-legend"><span>менше</span><i /><span>більше часу</span></div>
      <p className="footnote">{note ?? "Точка людини — середина нижнього краю рамки (там, де стоять ноги). Кадр перспективний: дальня частина залу стиснута."}</p>
    </section>
  );
}

// ---- table occupancy grid (tables x time) ----

export function TableGrid({ rows, labels, tooltipLabels, tickEvery = 1 }: {
  rows: { id: string; label: string; rates: (number | null)[] }[];
  labels: string[];
  tooltipLabels: string[];
  tickEvery?: number;
}) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  return (
    <div className="table-grid" onMouseLeave={() => setHover(null)}>
      <div className="tg-rows">
        {rows.map((row, rowIndex) => (
          <div key={row.id} className="tg-row">
            <span className="tg-label">{row.label}</span>
            <div className="tg-cells">
              {row.rates.map((rate, col) => (
                <i
                  key={col}
                  className={rate === null ? "tg-cell gap" : "tg-cell"}
                  style={rate === null ? undefined : { background: `color-mix(in oklab, #1c5cab ${Math.round(8 + rate * 92)}%, #eef3fa)` }}
                  onMouseEnter={() => setHover({ row: rowIndex, col })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="tg-axis" aria-hidden="true">
        <span className="tg-label" />
        <div className="tg-cells">{labels.map((label, index) => <span key={label + index}>{index % tickEvery === 0 ? label : ""}</span>)}</div>
      </div>
      {hover && (
        <p className="tg-readout" role="status">
          <strong>{rows[hover.row].label}</strong> · {tooltipLabels[hover.col]} · {rows[hover.row].rates[hover.col] === null ? "немає даних" : `зайнятий ${formatPercent(rows[hover.row].rates[hover.col])} часу`}
        </p>
      )}
      <div className="heat-legend tg-legend"><span>вільний</span><i /><span>зайнятий весь час</span><span className="gap-swatch" />немає даних</div>
    </div>
  );
}
