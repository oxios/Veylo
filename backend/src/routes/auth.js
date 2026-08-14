const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/user");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");
const ApiError = require("../utils/api-error");
const asyncHandler = require("../utils/async-handler");

const router = express.Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.cookieSecure,
  path: "/",
  maxAge: env.cookieMaxAgeMs,
};

router.post("/login", validate(schemas.login), asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!valid) throw new ApiError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");

  user.lastLoginAt = new Date();
  await user.save();
  const token = jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
    algorithm: "HS256",
    issuer: "venueflow-api",
    audience: "venueflow-web",
  });

  res.cookie("venueflow_token", token, cookieOptions);
  const payload = { user: user.toJSON() };
  if (req.get("x-auth-mode")?.toLowerCase() === "bearer") payload.token = token;
  res.json(payload);
}));

router.post("/logout", (_req, res) => {
  res.clearCookie("venueflow_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
  });
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

module.exports = router;
