import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const appFiles = fs.readdirSync(path.join(root, "app"))
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => path.join(root, "app", name));

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  return { text, source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

function attributes(opening, source) {
  const result = new Map();
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    result.set(property.name.getText(source), property.initializer?.getText(source) ?? "true");
  }
  return result;
}

function staticClass(attrs) {
  const value = attrs.get("className");
  return value?.match(/^['\"](.+)['\"]$/)?.[1] ?? "";
}

test("every interactive control has an action, accessible name, and controlled state", () => {
  const issues = [];
  const totals = { button: 0, input: 0, select: 0, textarea: 0 };
  for (const file of appFiles) {
    const { source } = parse(file);
    const visit = (node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText(source);
        if (tag in totals) {
          totals[tag] += 1;
          const attrs = attributes(opening, source);
          const line = source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1;
          const where = `${path.basename(file)}:${line}`;
          if (tag === "button" && !attrs.has("onClick") && !attrs.has("type")) issues.push(`${where} button has no action`);
          if (["input", "select", "textarea"].includes(tag)) {
            let insideLabel = false;
            for (let parent = node.parent; parent && parent !== source; parent = parent.parent) {
              if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "label") { insideLabel = true; break; }
            }
            if (!insideLabel && !attrs.has("aria-label") && !attrs.has("aria-labelledby")) issues.push(`${where} field has no accessible label`);
            const hasState = attrs.has("value") || attrs.has("checked");
            const stateIsSafe = attrs.has("onChange") || attrs.has("readOnly") || attrs.has("disabled");
            if (!hasState) issues.push(`${where} field has no explicit state`);
            if (hasState && !stateIsSafe) issues.push(`${where} controlled field cannot change`);
            if (attrs.has("defaultValue") || attrs.has("defaultChecked")) issues.push(`${where} uses an uncontrolled default`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(issues, []);
  assert.ok(totals.button >= 230, `expected complete UI inventory, got ${totals.button} buttons`);
  assert.ok(totals.input >= 50, `expected complete form inventory, got ${totals.input} inputs`);
  assert.ok(totals.select >= 40, `expected complete form inventory, got ${totals.select} selects`);
});

test("all modal surfaces expose dialog semantics and a title", () => {
  const modalTokens = new Set(["modal", "sys-modal", "audit-modal", "biz-modal", "v2-po-modal", "screen-control", "sys-wizard", "qa-drawer", "qa-action-sheet", "biz-ai-drawer"]);
  const issues = [];
  for (const file of appFiles) {
    const { source } = parse(file);
    const visit = (node) => {
      if (ts.isJsxElement(node)) {
        const attrs = attributes(node.openingElement, source);
        const classes = staticClass(attrs).split(/\s+/);
        if (classes.some((name) => modalTokens.has(name))) {
          const line = source.getLineAndCharacterOfPosition(node.openingElement.getStart(source)).line + 1;
          const where = `${path.basename(file)}:${line}`;
          if (attrs.get("role") !== '"dialog"') issues.push(`${where} modal has no dialog role`);
          if (attrs.get("aria-modal") !== '"true"') issues.push(`${where} modal is not marked modal`);
          if (!attrs.has("aria-label") && !attrs.has("aria-labelledby")) issues.push(`${where} modal has no accessible title`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(issues, []);
});

test("every navigable page has a data contract", () => {
  const pageFile = parse(path.join(root, "app", "page.tsx"));
  const qaFile = parse(path.join(root, "app", "qa.tsx"));
  let pageKeys = [];
  let contractKeys = [];
  const visitPage = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "Key" && ts.isUnionTypeNode(node.type)) {
      pageKeys = node.type.types.filter(ts.isLiteralTypeNode).map((item) => item.literal.text);
    }
    ts.forEachChild(node, visitPage);
  };
  const visitQa = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "pageContracts" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      contractKeys = node.initializer.properties.map((property) => property.name?.getText(qaFile.source).replace(/["']/g, "")).filter(Boolean);
    }
    ts.forEachChild(node, visitQa);
  };
  visitPage(pageFile.source);
  visitQa(qaFile.source);
  assert.equal(pageKeys.length, 37);
  assert.deepEqual(contractKeys.sort(), pageKeys.sort());
});

test("critical setup dependencies persist across the full location-to-insight chain", () => {
  const system = fs.readFileSync(path.join(root, "app", "system.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const qa = fs.readFileSync(path.join(root, "app", "qa.tsx"), "utf8");
  for (const token of ["businessHours", "coordinates", "planFloors", "customZones", "configuredCameras", "configuredScreens", "connectedSources", "zoneCameraLinks", "privacyConfigured", "historyDays"]) {
    assert.match(system, new RegExp(`\\b${token}\\b`), `missing persisted dependency ${token}`);
  }
  for (const gate of ["sourceReady", "!tested", "visionReady", "visionWarningAccepted", "compatibleAnalytics.length === 0", "validation test", "onActivate"]) {
    assert.ok(system.includes(gate), `camera workflow lost gate: ${gate}`);
  }
  assert.match(qa, /Нет ни одной подключённой камеры/);
  assert.match(qa, /Не создано ни одной зоны на плане/);
  assert.match(qa, /POS не сопоставлен с локацией/);
  assert.match(qa, /Исторические события ещё не накоплены/);
  assert.match(system, /spatialZonesFor/);
  assert.match(page, /guests: 0/);
  assert.doesNotMatch(page, /\?\? signalsByLocation\.franko/);
  assert.match(page, /alertRowsForLocation/);
  assert.match(page, /configuredScreens:/);
});

test("camera connection wizard keeps its visible, gated, and persisted flow", () => {
  const system = fs.readFileSync(path.join(root, "app", "system.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "app", "system.css"), "utf8");
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const locationRoute = fs.readFileSync(path.join(root, "backend", "src", "routes", "locations.js"), "utf8");
  const schemas = fs.readFileSync(path.join(root, "backend", "src", "validation", "schemas.js"), "utf8");

  assert.match(system, /className="sys-wizard-body" ref=\{wizardMainRef\}/);
  assert.match(styles, /\.sys-wizard>\.sys-wizard-body\{flex:1 1 auto;min-width:0;min-height:0;overflow:auto/);
  assert.match(system, /disabled=\{!stepReady \|\| submitting \|\| autoDraftCreating \|\| visionRunning\}/);
  assert.match(system, /wizardPlanAssetUrls/);
  assert.match(system, /Подложка плана/);
  assert.match(system, /connectedCameraByPlanId/);
  assert.match(system, /startAutoPlanFromVideo/);
  assert.match(system, /visibleSteps: WizardStep\[\]/);
  assert.match(system, /analyzeCameraVision/);
  assert.match(system, /commitAutoPlan/);
  assert.match(system, /\/camera-vision\/analyze/);
  assert.match(system, /sys-vision-compare/);
  assert.match(system, /visionResult\.detections\.map/);
  assert.match(system, /visionResult\.reconciliation\.counts\.map/);
  assert.match(system, /TEMPORARY_VIDEO_ACCEPT/);
  assert.match(system, /video\/x-msvideo/);
  assert.match(system, /\/camera-vision\/extract-video-frame/);
  assert.match(system, /temporaryVideo\.format === "avi"/);
  assert.match(system, /AVI до 200 МБ/);
  assert.match(system, /URL\.createObjectURL\(file\)/);
  assert.match(system, /context\.drawImage\(video/);
  assert.match(system, /!snapshotId \|\| !snapshotCapturedAt/);
  assert.match(system, /await complete\(/);
  assert.match(page, /method: "PATCH"/);
  assert.match(schemas, /configuredCameras: z\.array\(configuredCamera\)/);
  assert.match(locationRoute, /DUPLICATE_PLAN_CAMERA/);
});

test("camera vision analysis cannot hang or verify fallback engines", () => {
  const system = fs.readFileSync(path.join(root, "app", "system.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "app", "system.css"), "utf8");

  const lifecycleEffect = system.match(/useEffect\(\(\) => \{\s*const previousOverflow = document\.body\.style\.overflow;[\s\S]*?return \(\) => \{([\s\S]*?)\};\s*\}, \[\]\);/);
  assert.ok(lifecycleEffect, "camera wizard lifecycle cleanup must run only on real unmount");
  assert.match(lifecycleEffect[1], /visionRunRef\.current \+= 1;/);
  assert.match(lifecycleEffect[1], /visionAbortRef\.current\?\.abort\(\);/);
  assert.doesNotMatch(lifecycleEffect[0], /\[[^\]]*visionRunning[^\]]*\]/, "visionRunning rerenders must not invalidate the active request");

  const escapeEffect = system.match(/useEffect\(\(\) => \{\s*const handleEscape = \(event: KeyboardEvent\)[\s\S]*?\}, \[([^\]]*visionRunning[^\]]*)\]\);/);
  assert.ok(escapeEffect, "Escape handling may react to visionRunning without owning request cleanup");
  assert.doesNotMatch(escapeEffect[0], /visionRunRef\.current|visionAbortRef\.current/, "Escape listener cleanup must not invalidate analysis on rerender");

  assert.match(system, /const CAMERA_VISION_TIMEOUT_SECONDS = 60;/);
  assert.match(system, /const CAMERA_VISION_TIMEOUT_MS = CAMERA_VISION_TIMEOUT_SECONDS \* 1_000;/);
  assert.match(system, /const controller = new AbortController\(\);/);
  assert.match(system, /window\.setTimeout\(\(\) => \{\s*timedOut = true;\s*controller\.abort\(\);\s*\}, CAMERA_VISION_TIMEOUT_MS\);/);
  assert.match(system, /signal: controller\.signal/);
  assert.match(system, /window\.clearTimeout\(timeout\);/);
  assert.match(system, /if \(visionRunRef\.current === runId\) setVisionRunning\(false\);/);
  assert.ok((system.match(/className="sys-ai-progress-track is-indeterminate"/g) ?? []).length >= 2, "GPT and YOLO waits must use indeterminate progress");
  assert.match(styles, /\.sys-ai-progress-track\.is-indeterminate>i\{/);

  assert.match(system, /engine\.actual === true && engine\.fallback !== true/);
  assert.match(system, /result\.status\?\.toLocaleLowerCase\(\) === "fallback"\s*\|\| Object\.values\(result\.engines\)\.some\(\(engine\) => !cameraVisionEngineIsActual\(engine\)\)/);
  assert.match(system, /const visionReady = Boolean\(visionResult && !visionFallback && !visionRunning/);
  assert.match(system, /"gpt-plan": Boolean\(visionResult\?\.layout && !visionFallback && autoPlanQualityReady && !visionRunning && !visionError\)/);
  assert.match(system, /if \(!force && visionResult && visionSnapshotId === snapshotId\) return visionResult;/);
  assert.match(system, /analyzeCameraVision\(\{ force: true \}\)/);
  assert.match(system, /const AUTO_PLAN_MIN_CONFIDENCE = 0\.62;/);
  assert.match(system, /detectorIsActual \? "Результат YOLO" : "YOLO · резервный режим"/);
  assert.match(system, /Контрольный кадр с результатом YOLO/);
  assert.match(system, /mode: autoPlanFromVideo && !autoPlanAccepted \? "video-plan" : "existing-plan"/);
  assert.match(system, /\["table", "door"\]\.includes\(item\.kind\)/);
  assert.ok((system.match(/if \(visionFallback\) \{ setError\(visionFallbackMessage\); return; \}/g) ?? []).length >= 2, "both GPT-plan and vision-check Next actions must reject fallback results");
  assert.match(system, /disabled=\{!stepReady \|\| submitting \|\| autoDraftCreating \|\| visionRunning\}/);
  assert.match(system, /Резервный AI-результат — проверка не пройдена/);
  assert.match(system, /Повторить анализ/);
});

test("configured cameras can be deleted and camera vision uses the Docker YOLO worker", () => {
  const system = fs.readFileSync(path.join(root, "app", "system.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "app", "system.css"), "utf8");
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const locationRoute = fs.readFileSync(path.join(root, "backend", "src", "routes", "locations.js"), "utf8");
  const removal = fs.readFileSync(path.join(root, "backend", "src", "services", "camera-removal.js"), "utf8");
  const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  const worker = fs.readFileSync(path.join(root, "yolo-worker", "app", "main.py"), "utf8");

  assert.match(system, /function CameraDeleteDialog/);
  assert.match(system, /sys-camera-delete-dialog" role="dialog"/);
  assert.match(system, /onDeleteCamera\(definition\.id\)/);
  assert.match(system, /sys-calibration-simple/);
  assert.match(styles, /\.sys-camera-delete-dialog/);
  assert.match(styles, /\.sys-calibration-commandbar/);
  assert.match(page, /method: "DELETE"/);
  assert.match(locationRoute, /delete\("\/:locationId\/cameras\/:cameraId"/);
  assert.match(removal, /findOneAndUpdate/);
  assert.match(removal, /zoneCameraLinks/);
  assert.doesNotMatch(removal, /PlanElement\.(delete|findOneAndDelete)/);
  assert.match(compose, /yolo:/);
  assert.match(compose, /YOLO_API_URL: http:\/\/yolo:8000\/detect/);
  assert.match(worker, /@app\.post\("\/detect"\)/);
  assert.match(worker, /"actual": True/);
});

test("zone dragging stays local until pointer release", () => {
  const source = fs.readFileSync(path.join(root, "app", "plan-canvas.tsx"), "utf8");
  assert.match(source, /const \[canvasZones, setCanvasZones\] = useState<PlanCanvasZone\[]>\(zones\)/);
  assert.match(source, /const publishZones = \(next: PlanCanvasZone\[], commit = false\) => \{[\s\S]*?setCanvasZones\(next\);[\s\S]*?if \(commit\) \{\s*onZonesChange\?\.\(next\);/);
  assert.match(source, /const moveZoneInteraction[\s\S]*?publishZones\(zonesRef\.current\.map/);
  assert.match(source, /const finishZoneInteraction[\s\S]*?if \(interaction\.moved\) publishZones\(zonesRef\.current, true\)/);
});
