# Bazar.com Lab 2

## Replication, Caching, Load Balancing, and Consistency

This project is an extension of Lab 1: **Bazar.com**, a multi-tier online bookstore implemented using Node.js, Express, REST APIs, and Docker.

In Lab 2, the system was extended with:

- Catalog service replication
- Order service replication
- Round-robin load balancing
- In-memory caching
- Cache invalidation
- Catalog replica synchronization
- Performance measurements

---

## System Architecture

The system consists of five microservices:

```text
Client / Postman
      |
      v
Frontend Service
      |
      |---------------------------
      |                          |
      v                          v
Catalog Replicas            Order Replicas
catalog1                    order1
catalog2                    order2
```

The frontend is the only service accessed directly by the client. It forwards requests to catalog or order replicas.

---

## Services

| Service  | Description                       | External Port |
| -------- | --------------------------------- | ------------: |
| frontend | API Gateway, cache, load balancer |          3000 |
| catalog1 | Catalog replica 1                 |          3001 |
| catalog2 | Catalog replica 2                 |          3003 |
| order1   | Order replica 1                   |          3002 |
| order2   | Order replica 2                   |          3004 |

Inside Docker, both catalog replicas run on port `3001`, and both order replicas run on port `3002`.

---

## Main Features

### 1. Replication

The catalog service is replicated into:

```text
catalog1
catalog2
```

The order service is replicated into:

```text
order1
order2
```

Both catalog replicas start with the same book data.

---

### 2. Load Balancing

The frontend uses round-robin load balancing.

Catalog requests are distributed between:

```text
http://catalog1:3001
http://catalog2:3001
```

Order requests are distributed between:

```text
http://order1:3002
http://order2:3002
```

---

### 3. Caching

The frontend contains an in-memory cache for:

```text
GET /info/:id
```

The first request for a book is a cache miss. The frontend fetches the data from a catalog replica and stores it in memory.

Repeated requests for the same book are returned directly from cache.

Example logs:

```text
CACHE MISS for book 1
CACHE HIT for book 1
```

---

### 4. Cache Invalidation

When a book is purchased or updated, the frontend invalidates the cached item.

This prevents stale data from being returned after write operations.

Invalidation happens after:

```text
POST /purchase/:id
PUT /update/:id
```

---

### 5. Catalog Replica Synchronization

When a purchase or update happens, the system updates both catalog replicas.

For example, when a book is purchased, the quantity is decremented on both:

```text
catalog1
catalog2
```

---

## Project Structure

```text
bazar-com/
├── frontend/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── catalog/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── order/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── data/
│   ├── catalog.json
│   ├── catalog1.json
│   ├── catalog2.json
│   ├── orders.json
│   ├── orders1.json
│   └── orders2.json
│
├── Docs/
│   ├── design_document.md
│   ├── output.txt
│   └── performance_results.md
│
├── docker-compose.yml
├── performance_test.js
└── README.md
```

---

## Data Files

Catalog replica files:

```text
data/catalog1.json
data/catalog2.json
```

Order replica files:

```text
data/orders1.json
data/orders2.json
```

The catalog files contain the book catalog.  
The order files store purchase records.

---

## How to Run

### 1. Open the project folder

```bash
cd bazar-com
```

### 2. Start the system

```bash
docker compose up --build
```

### 3. Stop the system

```bash
docker compose down --remove-orphans
```

---

## API Endpoints

### Search Books by Topic

```http
GET http://localhost:3000/search/distributed%20systems
```

```http
GET http://localhost:3000/search/undergraduate%20school
```

---

### Get Book Information

```http
GET http://localhost:3000/info/1
```

Example response:

```json
{
  "source": "http://catalog1:3001",
  "data": {
    "title": "How to get a good grade in DOS in 40 minutes a day",
    "quantity": 5,
    "price": 40
  }
}
```

If the result comes from cache:

```json
{
  "source": "cache",
  "data": {
    "title": "How to get a good grade in DOS in 40 minutes a day",
    "quantity": 5,
    "price": 40
  }
}
```

---

### Purchase a Book

```http
POST http://localhost:3000/purchase/1
```

Example response:

```json
{
  "source": "http://order1:3002",
  "message": "Purchase completed successfully",
  "data": {
    "message": "Purchase completed successfully",
    "order": {
      "orderId": 1,
      "itemId": 1,
      "title": "How to get a good grade in DOS in 40 minutes a day",
      "price": 40,
      "processedBy": "order1"
    },
    "updatedReplicas": ["http://catalog1:3001", "http://catalog2:3001"]
  }
}
```

---

### Update a Book

```http
PUT http://localhost:3000/update/1
```

Example JSON body:

```json
{
  "price": 55
}
```

Another example:

```json
{
  "quantityChange": 5
}
```

---

## Testing Examples

### Test Cache

Send the same request twice:

```http
GET http://localhost:3000/info/1
GET http://localhost:3000/info/1
```

Expected logs:

```text
CACHE MISS for book 1
CACHE HIT for book 1
```

---

### Test Load Balancing

Send these requests:

```http
GET http://localhost:3000/search/distributed%20systems
GET http://localhost:3000/search/undergraduate%20school
GET http://localhost:3000/search/distributed%20systems
```

Expected logs:

```text
Catalog load balancer selected: http://catalog1:3001
Catalog load balancer selected: http://catalog2:3001
Catalog load balancer selected: http://catalog1:3001
```

The exact first replica may differ depending on previous requests.

---

### Test Purchase and Cache Invalidation

Send:

```http
GET http://localhost:3000/info/1
GET http://localhost:3000/info/1
POST http://localhost:3000/purchase/1
GET http://localhost:3000/info/1
```

Expected behavior:

```text
First info request  -> CACHE MISS
Second info request -> CACHE HIT
Purchase request    -> CACHE INVALIDATED
Next info request   -> CACHE MISS
```

The quantity should decrease by 1.

---

### Test Update and Cache Invalidation

Send:

```http
PUT http://localhost:3000/update/1
```

Body:

```json
{
  "price": 55
}
```

Then send:

```http
GET http://localhost:3000/info/1
```

Expected behavior:

```text
CACHE INVALIDATED for book 1 after catalog update
CACHE MISS for book 1
```

The returned price should be updated to `55`.

---

## Performance Test

A performance script is included:

```text
performance_test.js
```

Run it while Docker containers are running:

```bash
node performance_test.js
```

The script measures average response time for:

- Info requests with mostly cache misses
- Info requests with cache hits
- Search requests
- Purchase requests with cache invalidation
- Info requests after invalidation

Example results:

| Operation                                 | Requests | Average Response Time |
| ----------------------------------------- | -------: | --------------------: |
| Info requests - mostly cache misses       |       20 |               6.65 ms |
| Info requests - cache hits                |       20 |               2.90 ms |
| Search requests                           |       20 |               9.55 ms |
| Purchase requests with cache invalidation |        3 |              54.00 ms |
| Info after invalidation - cache miss      |        5 |               4.00 ms |

---

## Notes

- The frontend service is not replicated.
- The cache is stored in frontend memory.
- Only `/info/:id` requests are cached.
- Search requests are not cached in this implementation.
- Catalog write operations are applied to all catalog replicas.
- Order replicas store their processed orders separately.

---

## Possible Improvements

Future improvements could include:

- Use Redis as a separate cache service.
- Add LRU cache replacement.
- Add health checks for replicas.
- Add retry logic for failed replicas.
- Use least-loaded load balancing instead of round-robin.
- Store data in SQLite instead of JSON files.
- Replicate order logs between order replicas.
- Add automated tests.

---

## Author

Bazar.com Lab 2  
Distributed Operating Systems
