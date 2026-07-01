# Lab 2 Design Document

# Bazar.com: Replication, Caching, and Consistency

## 1. Overview

This project is an extension of Lab 1, where Bazar.com was implemented as a simple multi-tier online bookstore using microservices. In Lab 1, the system consisted of three main services:

- Frontend service
- Catalog service
- Order service

In Lab 2, the system was extended to improve performance, availability, and consistency by adding:

- Replication for the catalog service
- Replication for the order service
- Round-robin load balancing in the frontend
- In-memory caching in the frontend
- Cache invalidation after write operations
- Synchronization between catalog replicas

The goal of this design is to reduce response time for repeated read requests while keeping the catalog data consistent after purchases and updates.

---

## 2. System Architecture

The final system consists of five microservices:

```text
Client / Postman
      |
      v
Frontend Service
      |
      |-------------------------
      |                        |
      v                        v
Catalog Replicas          Order Replicas
catalog1                 order1
catalog2                 order2
```

The frontend service is the only service directly accessed by the client. It acts as an API gateway and forwards requests to the proper backend service.

The backend contains two catalog replicas and two order replicas. The catalog replicas store book information, while the order replicas process purchase requests.

---

## 3. Components

### 3.1 Frontend Service

The frontend service runs on port `3000`.

Its responsibilities are:

- Accept client requests
- Forward search and info requests to catalog replicas
- Forward purchase requests to order replicas
- Apply round-robin load balancing
- Maintain an in-memory cache for `/info/:id`
- Invalidate cached data after purchase or update operations

The frontend exposes the following main endpoints:

```text
GET  /search/:topic
GET  /info/:id
POST /purchase/:id
PUT  /update/:id
```

---

### 3.2 Catalog Replicas

There are two catalog replicas:

```text
catalog1
catalog2
```

Both replicas run the same code, but each one has its own catalog data file:

```text
catalog1 -> data/catalog1.json
catalog2 -> data/catalog2.json
```

The catalog service stores:

- Book ID
- Title
- Topic
- Quantity
- Price

The catalog service supports:

```text
GET /search/:topic
GET /info/:id
GET /query/item/:id
GET /query/topic/:topic
PUT /update/:id
```

The `/query/item/:id` endpoint is used internally by the order service to check if a book is available before purchase.

---

### 3.3 Order Replicas

There are two order replicas:

```text
order1
order2
```

Each order replica runs the same code, but each one writes to a different order file:

```text
order1 -> data/orders1.json
order2 -> data/orders2.json
```

The order service supports:

```text
POST /purchase/:id
GET  /orders
```

When an order replica receives a purchase request, it:

1. Reads the book information from an available catalog replica.
2. Checks if the book is in stock.
3. Sends an update request to all catalog replicas.
4. Records the order in its local order file.
5. Returns a success response to the frontend.

---

## 4. Replication

Replication was implemented for both catalog and order services.

### 4.1 Catalog Replication

The system has two catalog replicas. Both replicas start with the same catalog data.

Whenever a purchase or update operation modifies a book, the update is sent to both catalog replicas. This keeps the catalog replicas synchronized.

For example, when a book is purchased, the order service sends this update to both catalog replicas:

```json
{
  "quantityChange": -1
}
```

This ensures that both `catalog1` and `catalog2` have the same quantity after the purchase.

---

### 4.2 Order Replication

The system also has two order replicas. The frontend distributes purchase requests between them using round-robin load balancing.

Each order replica stores the orders that it processes in its own order file.

This design allows purchase requests to be distributed across multiple order servers instead of sending all purchase requests to one server.

---

## 5. Load Balancing

The frontend implements round-robin load balancing.

For catalog requests, the frontend alternates between:

```text
http://catalog1:3001
http://catalog2:3001
```

For order requests, the frontend alternates between:

```text
http://order1:3002
http://order2:3002
```

Example:

```text
First catalog request  -> catalog1
Second catalog request -> catalog2
Third catalog request  -> catalog1
```

Round-robin was chosen because it is simple, fair, and easy to implement. It also clearly demonstrates the concept of request distribution between replicas.

---

## 6. Caching

An in-memory cache was implemented inside the frontend service.

The cache stores results of:

```text
GET /info/:id
```

The cache key format is:

```text
info:<book_id>
```

For example:

```text
info:1
```

When a client requests book information, the frontend first checks the cache.

If the item exists in the cache, the frontend returns it directly:

```text
CACHE HIT
```

If the item is not in the cache, the frontend forwards the request to a catalog replica and stores the response in the cache:

```text
CACHE MISS
```

Caching improves performance because repeated read requests do not need to contact the catalog service.

---

## 7. Cache Consistency and Invalidation

Cache consistency is important because cached data can become stale after write operations.

For example, if `/info/1` is cached and then book 1 is purchased, the quantity changes. If the old cached value is returned, the client would see incorrect data.

To prevent this, the frontend invalidates cached data after:

```text
POST /purchase/:id
PUT  /update/:id
```

When a purchase succeeds, the frontend deletes the cached entry for that book:

```text
cache.delete("info:<book_id>")
```

The same happens after a catalog update.

This guarantees that the next `/info/:id` request becomes a cache miss and fetches the fresh value from one of the catalog replicas.

---

## 8. Data Storage

The project uses JSON files for persistent storage.

Catalog data files:

```text
data/catalog1.json
data/catalog2.json
```

Order data files:

```text
data/orders1.json
data/orders2.json
```

This choice keeps the system lightweight and follows the lab requirement to avoid heavyweight databases.

---

## 9. Docker Deployment

The system is deployed using Docker Compose.

The Docker Compose file starts five containers:

```text
frontend
catalog1
catalog2
order1
order2
```

The frontend communicates with the backend services using Docker service names:

```text
http://catalog1:3001
http://catalog2:3001
http://order1:3002
http://order2:3002
```

The services can be started using:

```bash
docker compose up --build
```

To stop the system:

```bash
docker compose down
```

---

## 10. How to Run the Program

### Step 1: Open the project folder

```bash
cd bazar-com
```

### Step 2: Start the system

```bash
docker compose up --build
```

### Step 3: Test the frontend API

Example info request:

```text
GET http://localhost:3000/info/1
```

Example search request:

```text
GET http://localhost:3000/search/distributed%20systems
```

Example purchase request:

```text
POST http://localhost:3000/purchase/1
```

Example update request:

```text
PUT http://localhost:3000/update/1
```

Body:

```json
{
  "price": 55
}
```

---

## 11. Example Behavior

### Cache Miss

First request:

```text
GET /info/1
```

The frontend does not find the item in cache, so it forwards the request to a catalog replica.

Log:

```text
CACHE MISS for book 1
Catalog load balancer selected: http://catalog1:3001
```

---

### Cache Hit

Second request:

```text
GET /info/1
```

The frontend returns the result directly from cache.

Log:

```text
CACHE HIT for book 1
```

---

### Purchase and Cache Invalidation

Purchase request:

```text
POST /purchase/1
```

The order service updates both catalog replicas.

Logs:

```text
[order1] Updated book 1 on http://catalog1:3001
[order1] Updated book 1 on http://catalog2:3001
CACHE INVALIDATED for book 1
```

The next `/info/1` request becomes a cache miss and returns the updated quantity.

---

## 12. Design Tradeoffs

### 12.1 Round-Robin Load Balancing

Round-robin is simple and works well for this lab. However, it does not consider the actual load or response time of each replica.

A more advanced system could use least-loaded or latency-based load balancing.

---

### 12.2 In-Memory Cache

The cache is stored inside the frontend process. This makes cache access very fast and easy to implement.

However, if the frontend crashes or restarts, the cache is lost. This is acceptable for this lab because the cache is only used as a performance optimization.

A future improvement could use a separate cache service such as Redis.

---

### 12.3 Cache Invalidation

The implementation invalidates only the cached item that was modified. This is more efficient than clearing the whole cache.

However, if search results were also cached, then update and purchase operations might need to invalidate related search cache entries as well.

In this implementation, only `/info/:id` is cached, so invalidating `info:<id>` is enough.

---

### 12.4 Catalog Synchronization

The order service updates all catalog replicas during a purchase. This keeps the replicas synchronized.

The tradeoff is that write operations become slower because the order service must wait for all catalog replicas to update.

A more advanced system could use asynchronous replication, but that may temporarily allow inconsistent data.

---

## 13. Possible Improvements

Possible improvements include:

- Add a separate distributed cache service such as Redis.
- Add cache size limits and an LRU replacement policy.
- Add health checks for replicas.
- Add retry logic when a replica fails.
- Use least-loaded load balancing instead of round-robin.
- Store data in SQLite instead of JSON files.
- Replicate order logs between order replicas.
- Add automated tests for all API endpoints.
- Add more detailed performance graphs.

---

## 14. Performance Summary

The performance test showed that caching reduces the average response time of repeated `/info/:id` requests.

Measured results:

| Operation                                 | Requests | Average Response Time |
| ----------------------------------------- | -------: | --------------------: |
| Info requests - mostly cache misses       |       20 |               6.65 ms |
| Info requests - cache hits                |       20 |               2.90 ms |
| Search requests                           |       20 |               9.55 ms |
| Purchase requests with cache invalidation |        3 |              54.00 ms |
| Info after invalidation - cache miss      |        5 |               4.00 ms |

The cache hit response time was lower because the frontend served the request directly from memory without contacting a catalog replica.

Purchase requests were slower because they required multiple operations: reading from the catalog, updating both catalog replicas, recording the order, and invalidating the cache.

---

## 15. Conclusion

This Lab 2 implementation extends the original Bazar.com system by adding replication, caching, load balancing, and consistency handling.

The frontend distributes requests across replicas using round-robin load balancing. It also caches repeated book information requests to reduce latency. The system maintains consistency by invalidating cached data after purchases and catalog updates. Catalog replicas are kept synchronized by applying each write operation to all replicas.

The final system demonstrates the main concepts required in Lab 2: replication, caching, consistency, microservices, and containerized deployment.
