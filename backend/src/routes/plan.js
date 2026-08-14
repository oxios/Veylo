const express = require("express");
const crypto = require("node:crypto");
const multer = require("multer");
const Location = require("../models/location");
const PlanAsset = require("../models/plan-asset");
const PlanElement = require("../models/plan-element");
const Zone = require("../models/zone");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const { ownedFloor, ownedPlanElement } = require("../services/ownership");
const { toFrontendPlanElement, toStoredPlanElement } = require("../services/plan-elements");
const { buildAutoLayout, parsePdfMetadata, safeFileName } = require("../services/pdf-plan");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, callback) => {
    const looksLikePdf = file.mimetype === "application/pdf" || file.mimetype === "application/x-pdf";
    callback(looksLikePdf ? null : new ApiError(415, "Only PDF files are supported", "UNSUPPORTED_FILE"), looksLikePdf);
  },
});

const uploadPdf = upload.fields([
  { name: "plan", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

function getUploadedFile(req) {
  return req.files?.plan?.[0] || req.files?.file?.[0] || null;
}

async function validateZoneIds(elements, floor, ownerId) {
  const ids = [...new Set(elements.map((element) => element.zoneId).filter(Boolean))];
  if (!ids.length) return;
  const count = await Zone.countDocuments({ _id: { $in: ids }, floorId: floor._id, ownerId });
  if (count !== ids.length) {
    throw new ApiError(422, "One or more zoneId values do not belong to this floor", "INVALID_ZONE_REFERENCE");
  }
}

function frontendBoundsFit(element) {
  return element.x + element.width <= 100.0001 && element.y + element.height <= 100.0001;
}

function inferredZoneCandidates(elements, floor) {
  const roomPattern = /\b(?:hall|room|kitchen|bar|terrace|lounge|dining|reception|зал|кухн|бар|террас|терас|гардероб|касс|санитар|туалет|служеб|выдач|видач)\w*/iu;
  const seen = new Set();
  return elements.filter((element) => element.label && roomPattern.test(element.label)).map((element) => {
    const name = element.label.trim().slice(0, 100);
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    const left = Math.max(0, Math.min(86, (element.x / floor.canvas.width) * 100 - 2));
    const top = Math.max(0, Math.min(86, (element.y / floor.canvas.height) * 100 - 2));
    return {
      name,
      type: "PDF import",
      capacity: 0,
      coverage: 0,
      left: Math.round(left * 100) / 100,
      top: Math.round(top * 100) / 100,
      width: Math.min(14, 100 - left),
      height: Math.min(12, 100 - top),
    };
  }).filter(Boolean).slice(0, 12);
}

router.get("/floors/:floorId/plan", asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const [zones, elements, planAsset] = await Promise.all([
    Zone.find({ floorId: floor._id, ownerId: req.user._id }).sort({ createdAt: 1 }),
    PlanElement.find({ floorId: floor._id, ownerId: req.user._id }).sort({ zIndex: 1, createdAt: 1 }),
    PlanAsset.findOne({ floorId: floor._id, ownerId: req.user._id }).select("fileName size sha256 updatedAt"),
  ]);
  res.json({
    floor: floor.toJSON(),
    zones: zones.map((zone) => zone.toJSON()),
    planElements: elements.map((element) => toFrontendPlanElement(element, floor)),
    planPdfUrl: planAsset ? `/api/floors/${floor.id}/plan/pdf` : null,
    planFileName: planAsset?.fileName || null,
  });
}));

router.get("/floors/:floorId/plan/pdf", asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const asset = await PlanAsset.findOne({ floorId: floor._id, ownerId: req.user._id }).select("+data");
  if (!asset) throw new ApiError(404, "No PDF has been uploaded for this floor", "PLAN_PDF_NOT_FOUND");

  const encodedName = encodeURIComponent(asset.fileName).replace(/'/g, "%27");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(asset.size),
    "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "private, max-age=300",
    ETag: `"${asset.sha256}"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.send(asset.data);
}));

router.put("/floors/:floorId/plan/elements", validate(schemas.planElementsBulk), asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const inputs = req.validated.body.elements;
  await validateZoneIds(inputs, floor, req.user._id);

  const records = inputs.map((input, index) => toStoredPlanElement({
    ...input,
    clientId: input.clientId || `plan-${floor.level}-${Date.now()}-${index + 1}`,
  }, floor, {
    ownerId: req.user._id,
    locationId: floor.locationId,
    floorId: floor._id,
    source: "manual",
  }));

  await PlanElement.deleteMany({ floorId: floor._id, ownerId: req.user._id });
  const elements = records.length ? await PlanElement.insertMany(records) : [];
  res.json({
    floor: floor.toJSON(),
    planElements: elements.map((element) => toFrontendPlanElement(element, floor)),
  });
}));

router.post("/floors/:floorId/plan/elements", validate(schemas.planElementCreate), asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const input = req.validated.body;
  await validateZoneIds([input], floor, req.user._id);
  const element = await PlanElement.create(toStoredPlanElement(input, floor, {
    ownerId: req.user._id,
    locationId: floor.locationId,
    floorId: floor._id,
    source: "manual",
  }));
  res.status(201).json({ planElement: toFrontendPlanElement(element, floor) });
}));

router.patch("/plan-elements/:elementId", validate(schemas.planElementUpdate), asyncHandler(async (req, res) => {
  const element = await ownedPlanElement(req.params.elementId, req.user._id);
  const floor = await ownedFloor(String(element.floorId), req.user._id);
  const current = toFrontendPlanElement(element, floor);
  const merged = {
    ...current,
    ...req.validated.body,
    type: req.validated.body.type || current.kind,
  };
  if (!frontendBoundsFit(merged)) {
    throw new ApiError(422, "Element bounds must fit within the 0–100% canvas", "INVALID_ELEMENT_BOUNDS");
  }
  await validateZoneIds([merged], floor, req.user._id);

  const stored = toStoredPlanElement({
    ...merged,
    clientId: req.validated.body.clientId || element.clientId,
  }, floor, { source: element.source });
  delete stored.ownerId;
  delete stored.locationId;
  delete stored.floorId;
  Object.assign(element, stored);
  await element.save();
  res.json({ planElement: toFrontendPlanElement(element, floor) });
}));

router.delete("/plan-elements/:elementId", asyncHandler(async (req, res) => {
  const element = await ownedPlanElement(req.params.elementId, req.user._id);
  await element.deleteOne();
  res.status(204).end();
}));

router.post("/floors/:floorId/plan/import-pdf", uploadPdf, asyncHandler(async (req, res) => {
  const floor = await ownedFloor(req.params.floorId, req.user._id);
  const file = getUploadedFile(req);
  if (!file) throw new ApiError(422, "Attach a PDF in the plan or file form-data field", "PDF_REQUIRED");
  if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiError(415, "The uploaded file is not a valid PDF", "INVALID_PDF_SIGNATURE");
  }

  const metadata = await parsePdfMetadata(file.buffer);
  const generated = buildAutoLayout(metadata, floor.canvas);
  const zoneCandidates = inferredZoneCandidates(generated, floor);

  await Promise.all([
    PlanElement.deleteMany({ floorId: floor._id, ownerId: req.user._id, source: "pdf-auto" }),
    Zone.deleteMany({ floorId: floor._id, ownerId: req.user._id, source: "pdf-auto" }),
  ]);
  const inserted = generated.length ? await PlanElement.insertMany(generated.map((element) => ({
    ...element,
    ownerId: req.user._id,
    locationId: floor.locationId,
    floorId: floor._id,
  }))) : [];

  for (const candidate of zoneCandidates) {
    await Zone.findOneAndUpdate(
      { floorId: floor._id, ownerId: req.user._id, name: candidate.name },
      { $setOnInsert: {
        ...candidate,
        ownerId: req.user._id,
        locationId: floor.locationId,
        floorId: floor._id,
        floor: String(floor.level),
        cameras: [],
        source: "pdf-auto",
      } },
      { upsert: true, new: true, runValidators: true },
    );
  }

  const planFileName = safeFileName(file.originalname);
  await PlanAsset.findOneAndUpdate(
    { floorId: floor._id, ownerId: req.user._id },
    {
      $set: {
        ownerId: req.user._id,
        locationId: floor.locationId,
        floorId: floor._id,
        fileName: planFileName,
        mimeType: "application/pdf",
        size: file.size,
        sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
        data: file.buffer,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  floor.planImport = {
    originalName: planFileName,
    pageCount: metadata.pageCount,
    parsedPageCount: metadata.parsedPageCount,
    textCharacters: metadata.textCharacters,
    generatedElements: inserted.length,
    importedAt: new Date(),
  };
  await floor.save();

  const [location, zones, generatedZoneCount] = await Promise.all([
    Location.findOneAndUpdate(
      { _id: floor.locationId, ownerId: req.user._id },
      { $addToSet: { planFloors: String(floor.level) }, $max: { readiness: 30 } },
      { new: true, runValidators: true },
    ),
    Zone.find({ floorId: floor._id, ownerId: req.user._id }).sort({ createdAt: 1 }),
    Zone.countDocuments({ floorId: floor._id, ownerId: req.user._id, source: "pdf-auto" }),
  ]);
  if (location) {
    location.zones = await Zone.countDocuments({ locationId: location._id, ownerId: req.user._id });
    await location.save();
  }

  res.status(201).json({
    location: location?.toJSON(),
    floor: floor.toJSON(),
    zones: zones.map((zone) => zone.toJSON()),
    planElements: inserted.map((element) => toFrontendPlanElement(element, floor)),
    planFileName,
    planPdfUrl: `/api/floors/${floor.id}/plan/pdf`,
    importSummary: {
      pageCount: metadata.pageCount,
      parsedPageCount: metadata.parsedPageCount,
      textCharacters: metadata.textCharacters,
      generatedElements: inserted.length,
      generatedZones: generatedZoneCount,
      rawPdfStored: true,
    },
  });
}));

module.exports = router;
