# Monad Execution Trace Indexer (Node.js + Firebase + Svelte + WASM-ready)

Real-time multi-node block ingestion service for Monad RPC endpoints with reorg handling, execution trace extraction, ephemeral 1-hour retention, and a live visualization dashboard.

## Architecture

- **Backend (Node.js / Express / WS / ethers / Firebase Admin)**
  - Connects to 3 Monad nodes (HTTP + WSS).
  - Ingests blocks in real time and normalizes block/tx metadata.
  - Detects reorgs using `parentHash` and rolls back divergent blocks.
  - Extracts traces using `debug_traceTransaction` with opcode/internal-call flattening.
  - Assigns `parallelIndex` / `threadId` per transaction for visualization.
  - Stores canonical/rolled-back records in Firestore when credentials are configured.
  - Exposes REST query endpoints and throttled websocket pushes (`/ws`, 1-minute batches).

- **Frontend (Svelte + Vite, WASM-ready parser hook)**
  - Visualizes multi-node blocks with status coloring:
    - Green = canonical
    - Red = rolled-back
    - Yellow = pending
  - Pause/resume live stream.
  - Rewind and replay over recent 1-hour window.
  - Click blocks for modal detail with tx/opcode/internal calls and parallel metadata.

## Run

```bash
npm install
cp backend/.env.example backend/.env
npm run dev -w backend
npm run dev -w frontend
```

Backend: `http://localhost:4000`
Frontend: `http://localhost:5173`

## REST API

- `GET /api/blocks?nodeId=&fromHeight=&toHeight=`
- `GET /api/blocks/:hash`
- `GET /api/transactions/:txHash`
- `GET /api/holders/:address`

## WebSocket API

- `ws://localhost:4000/ws`
- Message:

```json
{
  "type": "blocks",
  "data": [
    {
      "nodeId": "Node1",
      "blockHeight": 101,
      "timestamp": 16777216,
      "hash": "abc123",
      "parentHash": "abc122",
      "transactions": [
        {
          "txHash": "tx1",
          "opcodes": ["PUSH1", "ADD", "CALL"],
          "parallelIndex": 0,
          "threadId": "thread-0"
        }
      ],
      "status": "canonical"
    }
  ]
}
```

## Notes

- If Firebase credentials are omitted, backend runs in memory-only mode.
- `frontend/src/wasmTrace.js` is the hook point for a custom `.wasm` parser/aggregator.
