const ApiError = require("../utils/api-error");

function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ApiError(422, "Validation failed", "VALIDATION_ERROR", result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))),
      );
    }

    req.validated = req.validated || {};
    req.validated[source] = result.data;
    return next();
  };
}

module.exports = validate;
