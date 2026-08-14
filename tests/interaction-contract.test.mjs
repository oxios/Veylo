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
  for (const gate of ["sourceReady", "!tested", "!placed", "compatibleAnalytics.length === 0", "validation test", "onActivate"]) {
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
