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
});
test("all modal surfaces expose dialog semantics and a title", () => {
  const modalTokens = new Set(["modal", "drawer", "dialog"]);
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

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("the cabinet is protected by AuthGate and routes only its known screens", () => {
  const page = read("app", "page.tsx");
  assert.ok(read("app", "types.ts").includes('export type PageKey = "overview" | "guests" | "staff" | "cameras" | "videos" | "admin";'));
  assert.ok(page.includes('{page === "admin" && user.isAdmin && <AdminPage />}'), "the admin screen renders only for admins");
  assert.ok(page.includes("<AuthGate><VenueFlowDashboard /></AuthGate>"));
  assert.ok(page.includes('if (!pageFromPath(pathname)) router.replace(pathForPage("overview"));'), "unknown paths fall back to the overview");
  assert.ok(read("app", "[screen]", "page.tsx").includes('export { default } from "../page";'));
});

test("overview never shows metrics without a processed video and marks missing markup as blocked", () => {
  const overview = read("app", "overview.tsx");
  assert.ok(overview.includes("{hasDone && <Dashboard "));
  assert.ok(overview.includes('blocked={metrics.entries ? undefined : "Намалюйте лінію входу на кадрі камери"}'));
  assert.ok(overview.includes('blocked={metrics.occupancy ? undefined : "Позначте зону залу на кадрі камери"}'));
});

test("live dashboard shows blocked states instead of zeros when markup is missing", () => {
  const overview = read("app", "overview.tsx");
  assert.ok(overview.includes('blocked={stats.tables ? undefined : "Розмітьте столики на кадрі камери"}'));
  assert.ok(overview.includes('blocked={stats.passersby ? undefined : "Потрібні лінія дверей і зона, де видно перехожих"}'));
  assert.ok(overview.includes("{liveCameras.length > 0 && <LiveDashboard "));
});

test("processing nodes talk to the API, not to MongoDB; the hub is authorised by the API", () => {
  const compose = read("docker-compose.yml");
  const node = read("deploy", "node", "docker-compose.yml");
  for (const service of ["mediamtx", "node-mediamtx", "camera-node"]) assert.match(compose, new RegExp(`^ {2}${service}:\s*$`, "m"));
  assert.doesNotMatch(compose, /video-worker/);
  assert.doesNotMatch(node, /MONGO/, "a remote node never gets database credentials");
  assert.match(node, /VENUEFLOW_URL/);
  assert.equal(node.split("- recordings:/recordings").length - 1, 3, "node-init, MediaMTX and camera-node share the 24 h archive");
  assert.match(compose, /MTX_AUTHHTTPADDRESS: http:\/\/api:4000\/api\/internal\/mediamtx\/auth/);
  assert.match(read("deploy", "node", "mediamtx.yml"), /recordDeleteAfter: 24h/);
  assert.doesNotMatch(compose + node, /onvif/i, "ONVIF stays out of scope");
});

test("camera secrets never reach the browser bundle", () => {
  for (const file of appFiles) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /rtsp(Main|Sub)Sealed|CAMERA_SECRET_KEY|MEDIAMTX_SECRET|NODE_TOKEN/, path.basename(file));
  }
  assert.doesNotMatch(read("docker-compose.yml"), /NEXT_PUBLIC_[A-Z_]*(SECRET|TOKEN|KEY)/);
});
