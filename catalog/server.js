/**
 * catalog/server.js
 * -----------------
 * Catalog Microservice for Bazar.com
 *
 * Responsibilities:
 *   - Store and serve book data (title, topic, quantity, price)
 *   - Support query-by-topic and query-by-item lookups
 *   - Support stock and price updates
 *
 * Data persistence: reads/writes to ../data/catalog.json
 * Port: 3001
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json()); // parse incoming JSON request bodies

const PORT = 3001;

// Path to the shared data file (mounted as a Docker volume)
const DATA_FILE = path.join(__dirname, '..', 'data', 'catalog.json');

/**
 * readCatalog()
 * Reads catalog.json from disk and returns the parsed array.
 * Returns an empty array if the file cannot be read or parsed.
 */
function readCatalog() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading catalog file:', error.message);
    return [];
  }
}

/**
 * writeCatalog(catalog)
 * Writes the given catalog array back to catalog.json.
 * Returns true on success, false on failure.
 */
function writeCatalog(catalog) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(catalog, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing catalog file:', error.message);
    return false;
  }
}

/**
 * GET /search/:topic
 * Query-by-subject: returns all books matching the given topic.
 * Only exposes id and title (not quantity or price).
 *
 * Example: GET /search/distributed%20systems
 * Response: [{ "id": 1, "title": "..." }, ...]
 */
app.get('/search/:topic', (req, res) => {
  const topic = req.params.topic.toLowerCase();
  const catalog = readCatalog();

  // Filter by topic (case-insensitive) and return only id + title
  const results = catalog
    .filter(book => book.topic.toLowerCase() === topic)
    .map(book => ({
      id: book.id,
      title: book.title
    }));

  res.json(results);
});

/**
 * GET /info/:id
 * Returns title, quantity, and price for a specific book by ID.
 * Used by the frontend's /info/:id endpoint.
 *
 * Example: GET /info/2
 * Response: { "title": "...", "quantity": 3, "price": 70 }
 */
app.get('/info/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const catalog = readCatalog();

  const book = catalog.find(item => item.id === id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  res.json({
    title: book.title,
    quantity: book.quantity,
    price: book.price
  });
});

/**
 * GET /query/item/:id
 * Returns the full book record (including topic) for a given ID.
 * Used internally by the Order Service before processing a purchase.
 *
 * Example: GET /query/item/2
 * Response: { "id": 2, "title": "...", "topic": "...", "quantity": 3, "price": 70 }
 */
app.get('/query/item/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const catalog = readCatalog();

  const book = catalog.find(item => item.id === id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  res.json(book);
});

/**
 * GET /query/topic/:topic
 * Returns all full book records for a given topic.
 * Returns complete book objects (including quantity and price).
 *
 * Example: GET /query/topic/distributed%20systems
 */
app.get('/query/topic/:topic', (req, res) => {
  const topic = req.params.topic.toLowerCase();
  const catalog = readCatalog();

  const books = catalog.filter(book => book.topic.toLowerCase() === topic);

  res.json(books);
});

/**
 * PUT /update/:id
 * Updates the price and/or quantity of a book.
 *
 * Request body:
 *   { "price": <number> }           — set a new price
 *   { "quantityChange": <number> }  — add/subtract from current quantity
 *   Both fields can be combined in a single request.
 *
 * Returns 400 if the quantity would go below zero (out of stock).
 * Returns 404 if the book ID does not exist.
 *
 * Used by the Order Service to decrement stock after a purchase
 * (sends { quantityChange: -1 }).
 */
app.put('/update/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { price, quantityChange } = req.body;

  const catalog = readCatalog();
  const bookIndex = catalog.findIndex(item => item.id === id);

  if (bookIndex === -1) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Update price if provided
  if (price !== undefined) {
    catalog[bookIndex].price = price;
  }

  // Update quantity if provided, preventing negative stock
  if (quantityChange !== undefined) {
    const newQuantity = catalog[bookIndex].quantity + quantityChange;

    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Not enough stock' });
    }

    catalog[bookIndex].quantity = newQuantity;
  }

  // Persist the updated catalog back to disk
  const success = writeCatalog(catalog);

  if (!success) {
    return res.status(500).json({ error: 'Failed to update catalog' });
  }

  res.json({
    message: 'Catalog updated successfully',
    book: catalog[bookIndex]
  });
});

app.listen(PORT, () => {
  console.log(`Catalog service running on port ${PORT}`);
});