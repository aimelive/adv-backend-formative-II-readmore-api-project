const mongoose = require("mongoose");
const Book = require("../models/Book");
const Author = require("../models/Author");

// True when `authorId` is a well-formed ObjectId pointing at a real Author.
// A malformed id can't match any author, so it counts as "does not exist".
const authorExists = async (authorId) =>
  mongoose.isValidObjectId(authorId) &&
  Boolean(await Author.exists({ _id: authorId }));

// Strength 2 compares letters case-insensitively ("the silent sea" equals
// "The Silent Sea"), but it still requires an exact match of the whole title.
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

// True when `authorId` already has a book titled `title` (ignoring case).
// `excludeBookId` leaves out the book being updated, so it doesn't clash with itself.
const authorHasBookWithTitle = async (authorId, title, excludeBookId) => {
  // Anything other than a string or number (e.g. an object like { $ne: "" }) is
  // never used as a filter; the schema rejects it when saving.
  if (typeof title !== "string" && typeof title !== "number") return false;

  // The schema trims titles before saving, so trim here too, or
  // " The Silent Sea " would not match the stored "The Silent Sea".
  const filter = { author: authorId, title: String(title).trim() };
  if (excludeBookId) filter._id = { $ne: excludeBookId };

  return Boolean(await Book.exists(filter).collation(CASE_INSENSITIVE));
};

const DUPLICATE_TITLE = {
  message: "This author already has a book with that title",
};

const EARLIEST_YEAR = 1450; // roughly when the printing press arrived

// Returns the value as a number when it can be checked, or null to skip it.
// Missing, null, empty or non-numeric values are left to the schema, which
// reports them as "required" or cast errors instead.
const toCheckableNumber = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Checks price and publishedYear, but only the ones present in `body`.
// Returns a message describing every problem, or null when both are fine.
const priceAndYearError = (body) => {
  const problems = [];

  const price = toCheckableNumber(body.price);
  if (price !== null && price <= 0) {
    problems.push(`price must be greater than 0 (got ${price})`);
  }

  const year = toCheckableNumber(body.publishedYear);
  // Read the year on every request, so the limit moves forward on 1 January.
  const currentYear = new Date().getFullYear();
  if (year !== null && (year < EARLIEST_YEAR || year > currentYear)) {
    problems.push(
      `publishedYear must be between ${EARLIEST_YEAR} and ${currentYear} (got ${year})`
    );
  }

  return problems.length ? problems.join("; ") : null;
};

const createBook = async (req, res) => {
  const body = req.body ?? {};
  // A missing author is left to the schema's `required` check (validation error).
  if (body.author != null && !(await authorExists(body.author))) {
    return res.status(400).json({ message: "Author does not exist" });
  }

  const rangeError = priceAndYearError(body);
  if (rangeError) {
    return res.status(422).json({ message: rangeError });
  }

  if (
    body.author != null &&
    (await authorHasBookWithTitle(body.author, body.title))
  ) {
    return res.status(409).json(DUPLICATE_TITLE);
  }

  const book = await Book.create(body);
  await book.populate("author");
  res.status(201).json(book);
};

const SORTABLE_FIELDS = ["price", "title", "publishedYear"];

// Escapes characters that mean something in a regex, so user text like
// "C++ (2nd ed.)" is matched literally instead of breaking the pattern.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Reads one query param as trimmed text. Returns undefined when it is missing
// or blank, so it is simply left out of the filter.
const readParam = (query, name, errors) => {
  const value = query[name];
  if (value === undefined) return undefined;
  // A repeated param (?genre=a&genre=b) arrives as an array.
  if (typeof value !== "string") {
    errors.push(`${name} must be given only once`);
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const readNumberParam = (query, name, errors) => {
  const raw = readParam(query, name, errors);
  if (raw === undefined) return undefined;
  const number = Number(raw);
  if (!Number.isFinite(number)) {
    errors.push(`${name} must be a number (got "${raw}")`);
    return undefined;
  }
  return number;
};

// Turns GET /books query params into a Mongo filter and sort, adding only the
// params that are present. Collects every problem in `errors`.
const buildBookQuery = (query) => {
  const errors = [];
  const filter = {};

  const genre = readParam(query, "genre", errors);
  if (genre !== undefined) {
    // Anchored with ^ and $ so it matches the whole genre, ignoring case.
    filter.genre = new RegExp(`^${escapeRegex(genre)}$`, "i");
  }

  const minPrice = readNumberParam(query, "minPrice", errors);
  const maxPrice = readNumberParam(query, "maxPrice", errors);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    errors.push(
      `minPrice cannot be greater than maxPrice (got ${minPrice} and ${maxPrice})`
    );
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  const author = readParam(query, "author", errors);
  if (author !== undefined) {
    if (mongoose.isValidObjectId(author)) {
      filter.author = author;
    } else {
      errors.push(`author must be a valid author id (got "${author}")`);
    }
  }

  const search = readParam(query, "search", errors);
  if (search !== undefined) {
    // Not anchored, so the title only has to contain the text.
    filter.title = new RegExp(escapeRegex(search), "i");
  }

  const sortField = readParam(query, "sort", errors);
  if (sortField !== undefined && !SORTABLE_FIELDS.includes(sortField)) {
    errors.push(
      `sort must be one of ${SORTABLE_FIELDS.join(", ")} (got "${sortField}")`
    );
  }

  const order = (readParam(query, "order", errors) ?? "asc").toLowerCase();
  if (order !== "asc" && order !== "desc") {
    errors.push(`order must be asc or desc (got "${order}")`);
  }

  let sort;
  if (sortField !== undefined && SORTABLE_FIELDS.includes(sortField)) {
    // _id breaks ties, so books with the same price or year keep a stable order.
    sort = { [sortField]: order === "desc" ? -1 : 1, _id: 1 };
  }

  return { errors, filter, sort };
};

// GET /books?genre=&minPrice=&maxPrice=&author=&search=&sort=&order=
const getAllBooks = async (req, res) => {
  const { errors, filter, sort } = buildBookQuery(req.query ?? {});
  if (errors.length) {
    return res.status(400).json({ message: errors.join("; ") });
  }

  let query = Book.find(filter).populate("author");
  if (sort) {
    query = query.sort(sort);
    // By default Mongo puts "Zebra" before "apple" (capitals first). An English
    // collation sorts titles the way people expect.
    if (sort.title) query = query.collation({ locale: "en" });
  }

  const books = await query;
  res.status(200).json(books);
};

const getBookById = async (req, res) => {
  const book = await Book.findById(req.params.id).populate("author");
  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }
  res.status(200).json(book);
};

const updateBook = async (req, res) => {
  const body = req.body ?? {};
  const changesAuthor = body.author != null;
  const changesTitle = body.title !== undefined;

  // Only check the author when the update is actually changing it.
  if (changesAuthor && !(await authorExists(body.author))) {
    return res.status(400).json({ message: "Author does not exist" });
  }

  // Same order as createBook: author (400), price/year (422), duplicate title (409).
  const rangeError = priceAndYearError(body);
  if (rangeError) {
    return res.status(422).json({ message: rangeError });
  }

  if (changesAuthor || changesTitle) {
    // A partial update may send only one of the two fields, so the other
    // comes from the book as it is now.
    const current = await Book.findById(req.params.id).select("author title");
    if (!current) {
      return res.status(404).json({ message: "Book not found" });
    }
    const authorId = changesAuthor ? body.author : current.author;
    const title = changesTitle ? body.title : current.title;
    if (await authorHasBookWithTitle(authorId, title, current._id)) {
      return res.status(409).json(DUPLICATE_TITLE);
    }
  }

  const book = await Book.findByIdAndUpdate(req.params.id, body, {
    returnDocument: "after",
    runValidators: true,
  }).populate("author");
  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }
  res.status(200).json(book);
};

const deleteBook = async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }
  res.status(200).json({ message: "Book deleted successfully" });
};

// GET /authors/:id/books
const getBooksByAuthor = async (req, res) => {
  const authorExists = await Author.exists({ _id: req.params.id });
  if (!authorExists) {
    return res.status(404).json({ message: "Author not found" });
  }
  const books = await Book.find({ author: req.params.id }).populate("author");
  res.status(200).json(books);
};

module.exports = {
  createBook,
  getAllBooks,
  getBookById,
  updateBook,
  deleteBook,
  getBooksByAuthor,
};
