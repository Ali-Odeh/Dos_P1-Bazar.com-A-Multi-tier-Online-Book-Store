# Lab 2 Performance Results

## Experiment Setup

The system was deployed using Docker Compose with five microservices:

- Frontend server
- Catalog replica 1
- Catalog replica 2
- Order replica 1
- Order replica 2

The frontend server uses round-robin load balancing between the catalog replicas and order replicas. It also maintains an in-memory cache for `/info/:id` requests.

The performance experiment was executed using a Node.js script called `performance_test.js`. Each test issued multiple HTTP requests to the frontend server and measured the average response time in milliseconds.

## Results

| Operation                                 | Number of Requests | Average Response Time (ms) | Min (ms) | Max (ms) |
| ----------------------------------------- | -----------------: | -------------------------: | -------: | -------: |
| Info requests - mostly cache misses       |                 20 |                       6.65 |        2 |       42 |
| Info requests - cache hits                |                 20 |                       2.90 |        2 |        4 |
| Search requests                           |                 20 |                       9.55 |        8 |       12 |
| Purchase requests with cache invalidation |                  3 |                      54.00 |       38 |       83 |
| Info after invalidation - cache miss      |                  5 |                       4.00 |        2 |        9 |

## Analysis

The results show that caching improves the response time of repeated `/info/:id` requests. The average response time decreased from 6.65 ms for mostly cache misses to 2.90 ms for cache hits. This happens because cache hits are served directly from the frontend memory without contacting the catalog replicas.

Search requests are not cached in this implementation, so they are always forwarded to one of the catalog replicas using round-robin load balancing.

Purchase requests have the highest response time because they require several backend operations. A purchase request is forwarded to an order replica, which reads the book information from a catalog replica, updates the quantity on all catalog replicas, records the order, and then the frontend invalidates the cached item.

After a purchase or catalog update, the cache entry for the modified book is invalidated. The next `/info/:id` request becomes a cache miss and must fetch the fresh data from a catalog replica. This ensures cache consistency and prevents stale data from being returned to clients.

## Conclusion

Caching significantly reduces the latency of repeated read requests. Replication and load balancing allow requests to be distributed across multiple backend replicas. Cache invalidation introduces a small overhead during write operations, but it is necessary to maintain consistency between the frontend cache and the replicated catalog data.
