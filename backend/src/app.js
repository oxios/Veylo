const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const { requireAuth } = require("./middleware/auth");
const { errorHandler, notFound } = require("./middleware/error-handler");
const authRoutes = require("./routes/auth");
const floorRoutes = require("./routes/floors");
const locationRoutes = require("./routes/locations");
const planRoutes = require("./routes/plan");
const zoneRoutes = require("./routes/zones");
const cameraVisionRoutes = require("./routes/camera-vision");
const ApiError = require("./utils/api-error");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new ApiError(403, "Origin is not allowed by CORS", "CORS_DENIED"));
  },
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
if (env.nodeEnv !== "test") app.use(morgan(env.isProduction ? "combined" : "dev"));

app.get("/api/health", (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "unavailable",
    database: databaseConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/locations", requireAuth, locationRoutes);
app.use("/api", requireAuth, floorRoutes);
app.use("/api", requireAuth, zoneRoutes);
app.use("/api", requireAuth, planRoutes);
app.use("/api/camera-vision", requireAuth, cameraVisionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
