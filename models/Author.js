const mongoose = require("mongoose");

const authorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    country: { type: String, trim: true },
    bio: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Author", authorSchema);
