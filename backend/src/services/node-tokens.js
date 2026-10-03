const crypto = require("node:crypto");

// Node tokens look like "vfn_<slug>_<secret>"; the API stores sha256(secret) only.
const TOKEN_PATTERN = /^vfn_([a-z0-9]{2,40})_([A-Za-z0-9_-]{24,128})$/;

const newSecret = () => crypto.randomBytes(32).toString("base64url");
const newSlug = () => crypto.randomBytes(8).toString("hex");
const hashSecret = (secret) => crypto.createHash("sha256").update(String(secret)).digest("hex");
const formatToken = (slug, secret) => `vfn_${slug}_${secret}`;

function parseToken(token) {
  const match = TOKEN_PATTERN.exec(String(token || ""));
  return match ? { slug: match[1], secret: match[2] } : null;
}

function secretMatches(secret, hash) {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(String(hash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function bearerToken(header) {
  const [scheme, token, extra] = String(header || "").trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

/** @returns the Node document or null; disabled nodes are returned so callers can say so. */
async function findNodeByToken(token, NodeModel) {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const node = await NodeModel.findOne({ slug: parsed.slug }).select("+tokenHash");
  if (!node || !secretMatches(parsed.secret, node.tokenHash)) return null;
  return node;
}

module.exports = { newSecret, newSlug, hashSecret, formatToken, parseToken, secretMatches, bearerToken, findNodeByToken };
