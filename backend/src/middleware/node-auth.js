const Node = require("../models/node");
const { bearerToken, findNodeByToken } = require("../services/node-tokens");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

// Authenticates a processing node by its bearer token (never by cookie).
const requireNode = asyncHandler(async (req, _res, next) => {
  const node = await findNodeByToken(bearerToken(req.get("authorization")), Node);
  if (!node) throw new ApiError(401, "Node token is invalid", "NODE_UNAUTHORIZED");
  if (!node.enabled) throw new ApiError(403, "Node is disabled by the administrator", "NODE_DISABLED");
  req.node = node;
  next();
});

function requireAdmin(req, _res, next) {
  if (!req.user?.isAdmin) return next(new ApiError(404, `Route ${req.method} ${req.originalUrl} was not found`, "NOT_FOUND"));
  return next();
}

module.exports = { requireNode, requireAdmin };
