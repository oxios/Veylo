const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const { requireAuth } = require("./middleware/auth");
const { requireAdmin } = require("./middleware/node-auth");
const adminRoutes = require("./routes/admin");
const internalRoutes = require("./routes/internal");
const nodeRoutes = require("./routes/node-api");
const { errorHandler, notFound } = require("./middleware/error-handler");
const authRoutes = require("./routes/auth");
const cameraRoutes = require("./routes/cameras");
const peopleRoutes = require("./routes/people");
const processingRoutes = require("./routes/processing");
const venueRoutes = require("./routes/venues");
const videoRoutes = require("./routes/videos");
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
// Node and internal routers parse their own bodies (larger limits, raw media), so they go before the global parser.
app.use("/api/node", nodeRoutes);
app.use("/api/internal", internalRoutes);
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
app.use("/api/venues", requireAuth, venueRoutes, peopleRoutes.venues);
app.use("/api/persons", requireAuth, peopleRoutes.persons);
app.use("/api/visits", requireAuth, peopleRoutes.visits);
app.use("/api/staff", requireAuth, peopleRoutes.staff);
app.use("/api/tracks", requireAuth, peopleRoutes.tracks);
app.use("/api/cameras", requireAuth, cameraRoutes);
app.use("/api/videos", requireAuth, videoRoutes);
app.use("/api/processing", requireAuth, processingRoutes);
app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
