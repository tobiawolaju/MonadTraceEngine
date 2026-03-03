<p align="center">
  <img src="./screenshots/logo.png" height="120"/>
</p>

<h1 align="center">MonadTraceEngine</h1>

<p align="center">
Production-style multi-node blockchain indexing engine with reorg detection, rate-limit resilience, and real-time execution trace streaming.
</p>

<p align="center">
  <a href="https://monadtraceengine.vercel.app" target="_blank"><strong>Live Demo</strong></a>
</p>

---

## Overview

MonadTraceEngine is a backend-focused blockchain infrastructure project designed to demonstrate production-grade ingestion, reliability engineering, and real-time observability.

It ingests blocks from multiple RPC nodes, detects consensus divergence, handles reorg rollbacks, extracts execution traces, and streams normalized data to a live frontend dashboard.

This project emphasizes backend system design rather than frontend presentation.

---

## What This Demonstrates

- Distributed systems thinking
- Multi-node ingestion with consensus comparison
- Reorg-aware rollback and recovery logic
- Queue-based backpressure control
- Per-node rate limiting with retry/backoff
- Real-time WebSocket streaming architecture
- Atomic multi-path writes to Firebase RTDB
- Modular backend system design

---

## Screenshots

<div style="display:flex; overflow-x:auto; gap:12px; padding:10px 0; white-space: nowrap;">
  <img src="./screenshots/2.jpg" height="260"/>
  <img src="./screenshots/3.jpg" height="260"/>
  <img src="./screenshots/4.jpg" height="260"/>
  <img src="./screenshots/5.jpg" height="260"/>
</div>

---

## Architecture

```mermaid
flowchart LR
  N1[Monad Node 1 RPC]
  N2[Monad Node 2 RPC]
  N3[Monad Node 3 RPC]

  subgraph BE[Backend - Node.js / Express]
    RM[RpcManager + RateLimiter]
    IM[IngestionManager]
    RGM[ReorgManager]
    FBM[FirebaseManager]
    API[REST API]
    WS[WsHub]
    MEM[(In-memory block window)]
  end

  subgraph DB[Firebase RTDB]
    B[(blocks)]
    T[(transactions)]
    TR[(traces)]
  end

  subgraph FE[Frontend - Svelte]
    OV[Network Overview]
    CG[Chain Grid]
    MD[Block Modal]
  end

  N1 --> RM
  N2 --> RM
  N3 --> RM
  RM --> IM
  IM --> RGM
  IM --> MEM
  IM --> FBM
  FBM --> B
  FBM --> T
  FBM --> TR
  MEM --> API
  MEM --> WS
  API --> OV
  API --> CG
  WS --> CG
  CG --> MD
````

---

## Backend Design Highlights

### RpcManager

* Per-node token-bucket rate limiting
* Exponential backoff for RPC rate-limit errors (`-32005`)
* Temporary node disablement on repeated failures
* Multi-node health tracking

### IngestionManager

* Per-node block queues
* Global trace processing queue
* Concurrency-limited workers
* In-memory normalized block + transaction store
* Indexed transaction lookup by hash
* Network consensus state snapshotting

### ReorgManager

* Rolling history window per node
* Parent-hash validation
* Automatic rollback callbacks on divergence
* Re-index support for corrected chain segments

### FirebaseManager

* Atomic multi-path updates
* Sanitized RTDB-safe keys
* Batched writes for performance
* Fault-tolerant persistence layer

---

## API

### Health & Metrics

* `GET /health`
* `GET /metrics`

### Blocks

* `GET /api/blocks`
* `GET /api/blocks/latest`
* `GET /api/blocks/:hash`

Query parameters:

* `nodeId`
* `status`
* `fromHeight`
* `toHeight`
* `fromTs`
* `toTs`
* `limit`

### Transactions

* `GET /api/transactions/:txHash`

### Network State

* `GET /api/nodes`
* `GET /api/network/overview`

### WebSocket

Endpoint:

```
ws://localhost:4000/ws
```

Events:

```json
{ "type": "ready" }
{ "type": "blocks", "data": [...] }
```

---

## Frontend Features

* Live multi-node block timeline
* Chain head agreement/divergence visualization
* Pause/resume stream control
* Backfill on reconnect
* Per-node lag and queue depth display
* Modal block + transaction details
* Trace summary inspection

---

## Quick Start

```bash
npm install
npm run dev
```

Services:

* Backend → [http://localhost:4000](http://localhost:4000)
* Frontend → [http://localhost:5173](http://localhost:5173)

---

## Environment Variables (Backend)

| Variable                           | Default | Description                          |
| ---------------------------------- | ------- | ------------------------------------ |
| `PORT`                             | `4000`  | Backend HTTP port                    |
| `WS_PATH`                          | `/ws`   | WebSocket endpoint path              |
| `POLL_INTERVAL_MS`                 | `3000`  | Poll cadence for HTTP RPC nodes      |
| `PER_NODE_BLOCK_CONCURRENCY`       | `5`     | Block-processing workers per node    |
| `TRACE_CONCURRENCY`                | `10`    | Global trace extraction worker count |
| `MAX_QUEUE_SIZE`                   | `1000`  | Max queued block or trace tasks      |
| `MAX_IN_MEMORY_BLOCKS`             | `5000`  | Retained in-memory block window      |
| `MAX_REQUESTS_PER_SECOND_PER_NODE` | `40`    | Per-node RPC request budget          |
| `SERVICE_ACCOUNT_JSON_PATH`        | —       | Firebase service account path        |
| `FIREBASE_DATABASE_URL`            | —       | Firebase RTDB URL                    |

---

## Engineering Focus

This project prioritizes:

* Reliability over raw throughput
* Observability over abstraction
* Explicit concurrency control
* Failure-aware ingestion
* Clear separation of concerns

It is intentionally structured to reflect backend infrastructure engineering patterns rather than demo-level blockchain tooling.

---

## Potential Future Enhancements

* Integration tests with mocked RPC reorg scenarios
* Persistent metrics to time-series storage
* Authentication + API rate limiting
* Dockerized deployment
* Horizontal ingestion scaling

---

## License

MIT
