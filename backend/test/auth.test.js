const assert = require("node:assert/strict");
const test = require("node:test");
const schemas = require("../src/validation/schemas");
const { errorHandler } = require("../src/middleware/error-handler");
const ApiError = require("../src/utils/api-error");

function captureResponse() {
  const response = { statusCode: 0, body: null };
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; return response; };
  return response;
}

test("login schema normalizes email and requires an 8+ character password", () => {
  const parsed = schemas.login.parse({ email: "  Owner@VenueFlow.Local ", password: "correct-horse" });
  assert.equal(parsed.email, "owner@venueflow.local");
  assert.equal(schemas.login.safeParse({ email: "owner@venueflow.local", password: "short" }).success, false);
  assert.equal(schemas.login.safeParse({ email: "not-an-email", password: "correct-horse" }).success, false);
});

test("error handler keeps client errors and masks server errors", () => {
  const unauthorized = captureResponse();
  errorHandler(new ApiError(401, "Authentication required", "UNAUTHORIZED"), {}, unauthorized, () => {});
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body.error.code, "UNAUTHORIZED");

  const crash = captureResponse();
  errorHandler(new Error("database password leaked"), {}, crash, () => {});
  assert.equal(crash.statusCode, 500);
  assert.equal(crash.body.error.message, "Internal server error");
});
