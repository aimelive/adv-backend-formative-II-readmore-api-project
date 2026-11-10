const mongoose = require("mongoose");

// Express recognizes error middleware by its four arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: "Validation failed", errors });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res
      .status(400)
      .json({ message: `Invalid value for ${err.path}: ${err.value}` });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
};

module.exports = errorHandler;
