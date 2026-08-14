const multer = require("multer");
const ApiError = require("../utils/api-error");

function notFound(req, _res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} was not found`, "NOT_FOUND"));
}

function errorHandler(error, _req, res, _next) {
  let normalized = error;

  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "PDF exceeds the 10 MB upload limit"
      : error.message;
    normalized = new ApiError(413, message, error.code);
  } else if (error?.name === "ValidationError") {
    normalized = new ApiError(422, "Database validation failed", "VALIDATION_ERROR",
      Object.values(error.errors).map((item) => ({ path: item.path, message: item.message })));
  } else if (error?.name === "CastError") {
    normalized = new ApiError(400, "Invalid identifier", "INVALID_ID");
  } else if (error?.code === 11000) {
    normalized = new ApiError(409, "A record with these unique fields already exists", "CONFLICT", error.keyValue);
  } else if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    normalized = new ApiError(400, "Malformed JSON body", "INVALID_JSON");
  }

  const status = normalized.status || 500;
  const payload = {
    error: {
      code: normalized.code || "INTERNAL_ERROR",
      message: status >= 500 ? "Internal server error" : normalized.message,
    },
  };

  if (normalized.details !== undefined) payload.error.details = normalized.details;
  if (process.env.NODE_ENV !== "production" && status >= 500) {
    payload.error.debug = normalized.message;
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
