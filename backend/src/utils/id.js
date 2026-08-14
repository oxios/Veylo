const mongoose = require("mongoose");
const ApiError = require("./api-error");

function requireObjectId(value, field = "id") {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new ApiError(400, `${field} is invalid`, "INVALID_ID", { field });
  }
  return value;
}

module.exports = { requireObjectId };
