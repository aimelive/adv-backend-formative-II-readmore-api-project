const express = require("express");
const validateObjectId = require("../middleware/validateObjectId");
const {
  createAuthor,
  getAllAuthors,
  getAuthorById,
  updateAuthor,
  deleteAuthor,
  getAuthorStats,
} = require("../controllers/authorController");
const { getBooksByAuthor } = require("../controllers/bookController");

const router = express.Router();
const validateAuthorId = validateObjectId("author");

router.route("/").post(createAuthor).get(getAllAuthors);

router
  .route("/:id")
  .get(validateAuthorId, getAuthorById)
  .put(validateAuthorId, updateAuthor)
  .delete(validateAuthorId, deleteAuthor);

router.get("/:id/books", validateAuthorId, getBooksByAuthor);
router.get("/:id/stats", validateAuthorId, getAuthorStats);

module.exports = router;
