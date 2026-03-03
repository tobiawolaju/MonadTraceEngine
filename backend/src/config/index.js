import dotenv from 'dotenv';

dotenv.config();

const defaultNodes = [
  { nodeId: 'Node1', rpc: process.env.MONAD_NODE1 || 'https://node1.monad.xyz:8545' },
  { nodeId: 'Node2', rpc: process.env.MONAD_NODE2 || 'https://node2.monad.xyz:8545' },
  { nodeId: 'Node3', rpc: process.env.MONAD_NODE3 || 'wss://node3.monad.xyz:8546' }
];

export const config = {
  port: Number(process.env.PORT || 4000),
  wsPath: process.env.WS_PATH || '/ws',
  metricsLogIntervalMs: Number(process.env.METRICS_LOG_INTERVAL_MS || 60_000),
  broadcastWindowMs: Number(process.env.BROADCAST_WINDOW_MS || 60_000),
  maxInMemoryBlocks: Number(process.env.MAX_IN_MEMORY_BLOCKS || 5000),
  nodes: defaultNodes,
  ingestion: {
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 3000),
    maxBatchSize: Number(process.env.MAX_BATCH_SIZE || 20),
    perNodeBlockConcurrency: Number(process.env.PER_NODE_BLOCK_CONCURRENCY || 5),
    traceConcurrency: Number(process.env.TRACE_CONCURRENCY || 10),
    maxQueueSize: Number(process.env.MAX_QUEUE_SIZE || 1000),
    lastBlocksWindow: Number(process.env.LAST_BLOCKS_WINDOW || 20),
    maxRequestsPerSecondPerNode: Number(process.env.MAX_REQUESTS_PER_SECOND_PER_NODE || 40)
  },
  retry: {
    maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS || 3),
    baseBackoffMs: Number(process.env.RETRY_BASE_BACKOFF_MS || 2000),
    maxBackoffMs: Number(process.env.RETRY_MAX_BACKOFF_MS || 10_000),
    disableNodeMs: Number(process.env.NODE_DISABLE_MS || 30_000)
  },
  firebase: {
    serviceAccountJsonPath:
      process.env.SERVICE_ACCOUNT_JSON_PATH ||
      process.env.ServiceAccountJson ||
      process.env.ServeiceAccuntJson ||
      '',
    databaseURL: process.env.FIREBASE_DATABASE_URL
  }
};
