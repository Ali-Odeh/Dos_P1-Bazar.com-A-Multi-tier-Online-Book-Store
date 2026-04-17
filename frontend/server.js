/**
 * frontend/server.js
 * ------------------
 * Frontend Microservice for Bazar.com — API Gateway
 *
 * Responsibilities:
 *   - Accept client HTTP requests
 *   - Route each request to the appropriate backend microservice
 *   - Forward responses (including errors) back to the client
 *
 * This service does NOT access data directly. All data operations
 * are delegated to the Catalog Service or Order Service.
 *
 * Port: 3000
 */

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = 3000;

// Backend service URLs.
// Local run defaults to localhost, while Docker Compose can override via env vars.
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3001';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3002';

/**
 * GET /search/:topic
 * Searches for books by topic.
 * Proxies the request to the Catalog Service's /search/:topic endpoint.
 *
 * Example: GET /search/distributed%20systems
 * Returns: [{ "id": 1, "title": "..." }, ...]
 */
app.get('/search/:topic', async (req, res) => {
  const topic = req.params.topic;

  try {
    const response = await axios.get(`${CATALOG_SERVICE_URL}/search/${encodeURIComponent(topic)}`);
    console.log(`Search request for topic: ${topic}`);

    if (Array.isArray(response.data) && response.data.length === 0) {
      console.log(`No books found for topic: ${topic}`);
      return res.status(404).json({
        error: 'This topic does not exist'
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error('Search error:', error.message);

    // Forward the catalog service's error status and message if available
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Catalog service error'
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /info/:id
 * Returns details (title, quantity, price) for a specific book.
 * Proxies the request to the Catalog Service's /info/:id endpoint.
 *
 * Example: GET /info/2
 * Returns: { "title": "...", "quantity": 3, "price": 70 }
 */
app.get('/info/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const response = await axios.get(`${CATALOG_SERVICE_URL}/info/${id}`);
    console.log(`Info request for item id: ${id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Info error:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Catalog service error'
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /purchase/:id
 * Initiates a purchase for the book with the given ID.
 * Proxies the request to the Order Service's /purchase/:id endpoint.
 * The Order Service handles stock verification, inventory update, and order recording.
 *
 * Example: POST /purchase/2
 * Returns: { "message": "Purchase completed successfully", "order": { ... } }
 * Returns 400 if the item is out of stock.
 */
app.post('/purchase/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const response = await axios.post(`${ORDER_SERVICE_URL}/purchase/${id}`);
    console.log(`Purchase request for item id: ${id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Purchase error:', error.message);

    // Forward the order/catalog service's error status and message if available
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Order service error'
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Frontend service running on port ${PORT}`);
});