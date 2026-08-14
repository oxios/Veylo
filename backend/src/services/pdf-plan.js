const path = require("node:path");
const pdfParse = require("pdf-parse");
const ApiError = require("../utils/api-error");

const MAX_PARSED_PAGES = 10;
const MAX_ITEMS_PER_PAGE = 1_000;
const MAX_GENERATED_LABELS = 24;

function safeFileName(name) {
  const baseName = path.basename(name || "floor-plan.pdf");
  return baseName.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "floor-plan.pdf";
}

function viewportFor(pageData) {
  try {
    const viewport = pageData.getViewport({ scale: 1 });
    if (Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height)) return viewport;
    return pageData.getViewport(1);
  } catch (_error) {
    return pageData.getViewport(1);
  }
}

async function parsePdfMetadata(buffer) {
  const pages = [];

  const pagerender = async (pageData) => {
    const viewport = viewportFor(pageData);
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    const items = textContent.items.slice(0, MAX_ITEMS_PER_PAGE).map((item) => ({
      text: String(item.str || "").trim().slice(0, 160),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
      width: Math.max(0, Number(item.width) || 0),
      height: Math.max(0, Number(item.height) || 0),
    })).filter((item) => item.text);

    pages.push({
      pageNumber: Number(pageData.pageNumber) || pages.length + 1,
      width: Math.max(1, Number(viewport.width) || 1),
      height: Math.max(1, Number(viewport.height) || 1),
      items,
    });

    return items.map((item) => item.text).join(" ");
  };

  let result;
  try {
    result = await pdfParse(buffer, { pagerender, max: MAX_PARSED_PAGES });
  } catch (_error) {
    throw new ApiError(422, "The PDF could not be parsed. It may be encrypted or damaged.", "PDF_PARSE_FAILED");
  }

  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  return {
    pageCount: Number(result.numpages) || pages.length,
    parsedPageCount: pages.length,
    textCharacters: String(result.text || "").length,
    pages,
    fallbackText: String(result.text || "").slice(0, 20_000),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function classifyText(text) {
  if (/\b(?:door|exit|entrance|двер(?:ь|і)?|вхід|вход|выход)\b/iu.test(text)) return "door";
  if (/\b(?:table|стол|стіл)(?:\s*[-№#]?\s*\d+)?\b/iu.test(text)) return "table";
  if (/\b(?:cam(?:era)?|камера)(?:\s*[-№#]?\s*\d+)?\b/iu.test(text)) return "camera";
  return "label";
}

function dimensionsFor(type, text) {
  if (type === "table") return { width: 56, height: 56, shape: "round", color: "#d8b46b" };
  if (type === "camera") return { width: 40, height: 40, shape: "icon", color: "#4f8edc" };
  if (type === "door") return { width: 72, height: 12, shape: "line", color: "#728079" };
  return {
    width: clamp(24 + text.length * 7, 80, 240),
    height: 28,
    shape: "rectangle",
    color: "#5f746b",
  };
}

function wall(clientId, x, y, width, height) {
  return {
    clientId,
    type: "wall",
    x,
    y,
    width,
    height,
    rotation: 0,
    label: "",
    shape: "line",
    color: "#46544e",
    zIndex: 0,
    locked: false,
    source: "pdf-auto",
  };
}

function buildAutoLayout(metadata, canvas = { width: 1200, height: 800 }) {
  const canvasWidth = canvas.width || 1200;
  const canvasHeight = canvas.height || 800;
  const padding = Math.max(24, Math.min(canvasWidth, canvasHeight) * 0.05);
  const innerWidth = canvasWidth - padding * 2;
  const innerHeight = canvasHeight - padding * 2;
  const elements = [
    wall("pdf-wall-top", padding, padding, innerWidth, 8),
    wall("pdf-wall-right", canvasWidth - padding - 8, padding, 8, innerHeight),
    wall("pdf-wall-bottom", padding, canvasHeight - padding - 8, innerWidth, 8),
    wall("pdf-wall-left", padding, padding, 8, innerHeight),
  ];

  const firstPage = metadata.pages[0];
  let candidates = firstPage?.items || [];
  if (!candidates.length && metadata.fallbackText) {
    candidates = metadata.fallbackText.split(/\r?\n/).map((text, index) => ({
      text: text.trim(),
      x: (index % 4) * 100,
      y: Math.floor(index / 4) * 40,
      width: 80,
      height: 12,
    })).filter((item) => item.text);
  }

  const sourceWidth = firstPage?.width || 400;
  const sourceHeight = firstPage?.height || Math.max(400, Math.ceil(candidates.length / 4) * 40);
  const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const seen = new Set();
  let labelCount = 0;

  for (const item of candidates) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 80) continue;
    const type = classifyText(text);
    if (type === "label" && labelCount >= MAX_GENERATED_LABELS) continue;
    const key = `${type}:${text.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (type === "label") labelCount += 1;

    const dimensions = dimensionsFor(type, text);
    const mappedX = padding + item.x * scale;
    const mappedY = padding + (sourceHeight - item.y) * scale;
    elements.push({
      clientId: `pdf-${type}-${elements.length + 1}`,
      type,
      x: Math.round(clamp(mappedX, padding + 10, canvasWidth - padding - dimensions.width - 10)),
      y: Math.round(clamp(mappedY - dimensions.height, padding + 10, canvasHeight - padding - dimensions.height - 10)),
      width: dimensions.width,
      height: dimensions.height,
      rotation: 0,
      label: text,
      shape: dimensions.shape,
      color: dimensions.color,
      zIndex: type === "label" ? 3 : 2,
      locked: false,
      source: "pdf-auto",
    });
  }

  return elements.slice(0, 100);
}

module.exports = {
  MAX_PARSED_PAGES,
  safeFileName,
  parsePdfMetadata,
  buildAutoLayout,
};
