const mongoose = require("mongoose");

// Returns middleware that rejects requests whose :id is not a valid ObjectId.
const validateObjectId = (resourceName) => (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid ${resourceName} id` });
  }
  next();
};

module.exports = validateObjectId;
