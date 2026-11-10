const Author = require("../models/Author");
const Book = require("../models/Book");

const createAuthor = async (req, res) => {
  const author = await Author.create(req.body ?? {});
  res.status(201).json(author);
};

const getAllAuthors = async (req, res) => {
  const authors = await Author.find();
  res.status(200).json(authors);
};

const getAuthorById = async (req, res) => {
  const author = await Author.findById(req.params.id);
  if (!author) {
    return res.status(404).json({ message: "Author not found" });
  }
  res.status(200).json(author);
};

const updateAuthor = async (req, res) => {
  const author = await Author.findByIdAndUpdate(req.params.id, req.body ?? {}, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!author) {
    return res.status(404).json({ message: "Author not found" });
  }
  res.status(200).json(author);
};

const deleteAuthor = async (req, res) => {
  // Check the author exists first, so a missing author is always a 404 even if
  // old books still point at its id.
  const authorExists = await Author.exists({ _id: req.params.id });
  if (!authorExists) {
    return res.status(404).json({ message: "Author not found" });
  }

  // Deleting an author who still has books would leave those books pointing
  // at nothing, so refuse and say how many books are in the way.
  const bookCount = await Book.countDocuments({ author: req.params.id });
  if (bookCount > 0) {
    return res
      .status(409)
      .json({ message: "Cannot delete author with existing books", bookCount });
  }

  const author = await Author.findByIdAndDelete(req.params.id);
  if (!author) {
    // Someone else deleted it between the check above and now.
    return res.status(404).json({ message: "Author not found" });
  }
  res.status(200).json({ message: "Author deleted successfully" });
};

// GET /authors/:id/stats
const getAuthorStats = async (req, res) => {
  const author = await Author.findById(req.params.id).select("name");
  if (!author) {
    return res.status(404).json({ message: "Author not found" });
  }

  // aggregate() does not convert strings to ObjectIds the way find() does, so
  // match on the real _id taken from the author we just loaded.
  const [stats] = await Book.aggregate([
    { $match: { author: author._id } },
    // Cheapest first; _id breaks ties so the same book is picked every time.
    { $sort: { price: 1, _id: 1 } },
    {
      $group: {
        _id: null,
        bookCount: { $sum: 1 },
        averagePrice: { $avg: "$price" },
        cheapestBook: { $first: "$title" },
        mostExpensiveBook: { $last: "$title" },
      },
    },
  ]);

  // No books means $group produces no result at all, so fall back to the defaults.
  res.status(200).json({
    author: author.name,
    bookCount: stats?.bookCount ?? 0,
    averagePrice: stats ? Math.round(stats.averagePrice * 100) / 100 : 0,
    cheapestBook: stats?.cheapestBook ?? null,
    mostExpensiveBook: stats?.mostExpensiveBook ?? null,
  });
};

module.exports = {
  createAuthor,
  getAllAuthors,
  getAuthorById,
  updateAuthor,
  deleteAuthor,
  getAuthorStats,
};
