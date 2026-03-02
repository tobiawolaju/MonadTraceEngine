import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  keepWindowMs: Number(process.env.KEEP_WINDOW_MS || 60 * 60 * 1000),
  rollbackWindow: Number(process.env.ROLLBACK_WINDOW || 120),
  broadcastWindowMs: Number(process.env.BROADCAST_WINDOW_MS || 60_000),
  nodes: [
    { nodeId: 'Node1', rpc: process.env.MONAD_NODE1 || 'https://node1.monad.xyz:8545' },
    { nodeId: 'Node2', rpc: process.env.MONAD_NODE2 || 'https://node2.monad.xyz:8545' },
    { nodeId: 'Node3', rpc: process.env.MONAD_NODE3 || 'wss://node3.monad.xyz:8546' }
  ],
  firebase: {
    serviceAccountJsonPath:
      process.env.ServeiceAccuntJson ||
      process.env.ServiceAccountJson ||
      process.env.SERVICE_ACCOUNT_JSON_PATH ||
      '',
    databaseURL: process.env.FIREBASE_DATABASE_URL
  }
};
