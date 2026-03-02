import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { WsHub } from './services/wsHub.js';
import { RpcManager } from './managers/rpcManager.js';
import { FirebaseManager } from './managers/firebaseManager.js';
import { ReorgManager } from './managers/reorgManager.js';
import { IngestionManager } from './managers/ingestionManager.js';

const metrics = {
  startedAt: Date.now(),
  blocksProcessed: 0,
  rpcErrors: 0,
  firebaseErrors: 0,
  rateLimitEvents: 0,
  reorgCount: 0,
  backpressurePauses: 0
};

function log(event, payload = {}) {
  console.log(JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...payload }));
}

async function bootstrap() {
  const firebaseManager = new FirebaseManager();
  firebaseManager.initFirebase();
  await firebaseManager.verifyDatabaseConnection();
  log('firebase.ready');

  const rpcManager = new RpcManager(config.nodes, metrics);
  const reorgManager = new ReorgManager({
    windowSize: config.ingestion.lastBlocksWindow,
    metrics,
    onRollback: async (_nodeId, fromHeight, toHeight) => {
      try {
        await firebaseManager.rollbackBlocks(fromHeight, toHeight);
      } catch (error) {
        metrics.firebaseErrors += 1;
        log('firebase.rollback.error', { message: error.message, fromHeight, toHeight });
      }
    }
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const wsHub = new WsHub(server, config.broadcastWindowMs);

  const ingestionManager = new IngestionManager({
    rpcManager,
    firebaseManager,
    reorgManager,
    metrics,
    onCanonicalBlock: (block) => wsHub.enqueue(block)
  });

  await ingestionManager.startIngestion();
  log('ingestion.started', { nodes: config.nodes.map((n) => n.nodeId) });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000) });
  });

  app.get('/metrics', (_req, res) => {
    res.json({
      ...metrics,
      queueDepths: Object.fromEntries(
        [...ingestionManager.blockQueues.entries()].map(([nodeId, q]) => [nodeId, { depth: q.depth, paused: q.paused }])
      ),
      traceQueueDepth: ingestionManager.traceQueue.depth
    });
  });

  app.get('/api/blocks', (req, res) => {
    const { nodeId, fromHeight, toHeight } = req.query;
    const blocks = ingestionManager.getWindowBlocks().filter((b) => {
      if (nodeId && b.nodeId !== nodeId) return false;
      if (fromHeight && b.blockHeight < Number(fromHeight)) return false;
      if (toHeight && b.blockHeight > Number(toHeight)) return false;
      return true;
    });
    res.json(blocks);
  });

  app.get('/api/blocks/:hash', (req, res) => {
    const block = ingestionManager.getBlockByHash(req.params.hash);
    if (!block) return res.status(404).json({ error: 'Block not found' });
    return res.json(block);
  });

  app.get('/api/transactions/:txHash', (req, res) => {
    const tx = ingestionManager.getTransaction(req.params.txHash);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    return res.json(tx);
  });

  server.listen(config.port, () => {
    log('server.ready', { url: `http://localhost:${config.port}` });
  });

  const metricTimer = setInterval(() => {
    log('metrics.minute', {
      blocksProcessedPerMinute: metrics.blocksProcessed,
      rpcErrors: metrics.rpcErrors,
      queueDepth: Object.fromEntries(
        [...ingestionManager.blockQueues.entries()].map(([nodeId, q]) => [nodeId, q.depth])
      ),
      traceQueueDepth: ingestionManager.traceQueue.depth,
      rateLimitEvents: metrics.rateLimitEvents,
      reorgCount: metrics.reorgCount
    });
    metrics.blocksProcessed = 0;
  }, config.metricsLogIntervalMs);

  const shutdown = () => {
    clearInterval(metricTimer);
    ingestionManager.stop();
    rpcManager.close();
    wsHub.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error(JSON.stringify({ level: 'error', event: 'bootstrap.failed', message: error.message }));
  process.exit(1);
});
