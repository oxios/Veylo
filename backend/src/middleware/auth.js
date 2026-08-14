const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/user");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

function tokenFromRequest(req) {
  const authorization = req.get("authorization");
  if (authorization) {
    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() === "bearer" && token && !extra) return token;
  }
  return req.cookies?.venueflow_token || null;
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = tokenFromRequest(req);
  if (!token) throw new ApiError(401, "Authentication is required", "AUTH_REQUIRED");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "venueflow-api",
      audience: "venueflow-web",
    });
  } catch (_error) {
    throw new ApiError(401, "Session is invalid or expired", "INVALID_TOKEN");
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, "Session user no longer exists", "INVALID_TOKEN");

  req.user = user;
  next();
});

module.exports = { requireAuth, tokenFromRequest };
