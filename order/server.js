/**
 * order/server.js
 * ---------------
 * Order Microservice for Bazar.com
 *
 * Responsibilities:
 *   - Process book purchase requests
 *   - Verify stock availability by querying the Catalog Service
 *   - Decrement stock in the Catalog Service after a successful purchase
 *   - Persist order records to ../data/orders.json
 *   - Expose an endpoint to list all past orders
 *
 * Port: 3002
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = 3002;

// Catalog URL can be overridden in Docker; localhost works for local development.
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3001';

// Path to the shared orders file (mounted as a Docker volume)
const ORDERS_FILE = path.join(__dirname, '..', 'data', 'orders.json');

/**
 * readOrders()
 * Reads orders.json from disk and returns the parsed array.
 * Returns an empty array if the file is missing or unreadable.
 */
function readOrders() {
  try {
    const data = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading orders file:', error.message);
    return [];
  }
}

/**
 * writeOrders(orders)
 * Writes the orders array back to orders.json.
 * Returns true on success, false on failure.
 */
function writeOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing orders file:', error.message);
    return false;
  }
}

/**
 * generateOrderId(orders)
 * Generates the next order ID by incrementing the last order's ID.
 * Returns 1 if no orders exist yet.
 */
function generateOrderId(orders) {
  if (orders.length === 0) {
    return 1;
  }
  return orders[orders.length - 1].orderId + 1;
}

/**
 * POST /purchase/:id
 * Processes a purchase request for the book with the given ID.
 *
 * Steps:
 *   1. Fetch full book details from Catalog Service (/query/item/:id)
 *   2. Check that quantity > 0; return 400 if out of stock
 *   3. Send PUT /update/:id to Catalog with { quantityChange: -1 }
 *   4. Append a new order record to orders.json
 *   5. Return the completed order to the caller
 *
 * Response: { "message": "...", "order": { orderId, itemId, title, price, purchasedAt } }
 */
app.post('/purchase/:id', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);

  // Validate that the ID is a number
  if (Number.isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  try {
    // Step 1: Get full book details from the catalog
    const infoResponse = await axios.get(`${CATALOG_SERVICE_URL}/query/item/${itemId}`);
    const book = infoResponse.data;

    // Step 2: Check stock availability
    if (book.quantity <= 0) {
      return res.status(400).json({
        error: 'Purchase failed. Item is out of stock.'
      });
    }

    // Step 3: Decrement the book's quantity in the catalog by 1
    await axios.put(`${CATALOG_SERVICE_URL}/update/${itemId}`, {
      quantityChange: -1
    });

    // Step 4: Record the order in orders.json
    const orders = readOrders();

    const newOrder = {
      orderId: generateOrderId(orders),
      itemId: book.id,
      title: book.title,
      price: book.price,
      purchasedAt: new Date().toISOString()
    };

    orders.push(newOrder);

    const success = writeOrders(orders);

    if (!success) {
      return res.status(500).json({ error: 'Failed to save order' });
    }

    // Log the purchase (as required by the lab spec)
    console.log(`bought book ${book.title}`);

    // Step 5: Return the completed order
    res.json({
      message: 'Purchase completed successfully',
      order: newOrder
    });

  } catch (error) {
    // Forward HTTP errors from the catalog service (e.g., 404 Book not found)
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Catalog service error'
      });
    }

    console.error('Purchase error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /orders
 * Returns the full list of all orders recorded in orders.json.
 *
 * Response: [ { orderId, itemId, title, price, purchasedAt }, ... ]
 */
app.get('/orders', (req, res) => {
  const orders = readOrders();
  res.json(orders);
});

app.listen(PORT, () => {
  console.log(`Order service running on port ${PORT}`);
});