const express = require("express");
const validateObjectId = require("../middleware/validateObjectId");
const {
  createBook,
  getAllBooks,
  getBookById,
  updateBook,
  deleteBook,
} = require("../controllers/bookController");

const router = express.Router();
const validateBookId = validateObjectId("book");

router.route("/").post(createBook).get(getAllBooks);

router
  .route("/:id")
  .get(validateBookId, getBookById)
  .put(validateBookId, updateBook)
  .delete(validateBookId, deleteBook);

module.exports = router;
