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
  backpressurePauses: 0,
  apiRequests: 0
};

function log(event, payload = {}) {
  console.log(JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...payload }));
}

function parseNumber(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
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
  const wsHub = new WsHub(server, { path: config.wsPath, broadcastWindowMs: config.broadcastWindowMs });

  const ingestionManager = new IngestionManager({
    rpcManager,
    firebaseManager,
    reorgManager,
    metrics,
    onCanonicalBlock: (block) => wsHub.enqueue(block)
  });

  await ingestionManager.startIngestion();
  log('ingestion.started', { nodes: config.nodes.map((n) => n.nodeId) });

  app.use((req, _res, next) => {
    metrics.apiRequests += 1;
    next();
  });

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
    const { nodeId, status } = req.query;
    const fromHeight = parseNumber(req.query.fromHeight, { min: 0 });
    const toHeight = parseNumber(req.query.toHeight, { min: 0 });
    const limit = parseNumber(req.query.limit, { min: 1, max: 2000 });
    const fromTs = parseNumber(req.query.fromTs, { min: 0 });
    const toTs = parseNumber(req.query.toTs, { min: 0 });
    if ((req.query.fromHeight && fromHeight === null) || (req.query.toHeight && toHeight === null)) {
      return res.status(400).json({ error: 'Invalid fromHeight/toHeight query values' });
    }
    if ((req.query.fromTs && fromTs === null) || (req.query.toTs && toTs === null)) {
      return res.status(400).json({ error: 'Invalid fromTs/toTs query values' });
    }
    if (fromHeight !== null && toHeight !== null && fromHeight > toHeight) {
      return res.status(400).json({ error: 'fromHeight must be <= toHeight' });
    }
    if (fromTs !== null && toTs !== null && fromTs > toTs) {
      return res.status(400).json({ error: 'fromTs must be <= toTs' });
    }

    const blocks = ingestionManager.getWindowBlocks().filter((b) => {
      if (nodeId && b.nodeId !== nodeId) return false;
      if (status && b.status !== status) return false;
      if (fromHeight !== null && b.blockHeight < fromHeight) return false;
      if (toHeight !== null && b.blockHeight > toHeight) return false;
      if (fromTs !== null && b.timestamp < fromTs) return false;
      if (toTs !== null && b.timestamp > toTs) return false;
      return true;
    });
    return res.json(limit ? blocks.slice(-limit) : blocks);
  });

  app.get('/api/blocks/latest', (_req, res) => {
    return res.json(ingestionManager.getLatestBlocksByNode());
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

  app.get('/api/nodes', (_req, res) => {
    return res.json(ingestionManager.getNodeStatuses());
  });

  app.get('/api/network/overview', (_req, res) => {
    return res.json(ingestionManager.getNetworkOverview());
  });

  app.get('/api/blocks/history', async (req, res) => {
    const beforeTs = parseNumber(req.query.beforeTs, { min: 1 });
    const limit = parseNumber(req.query.limit, { min: 1, max: 1000 }) || 200;
    if (beforeTs === null) return res.status(400).json({ error: 'Invalid beforeTs query value' });

    try {
      const blocks = await firebaseManager.loadHistoricalBlocks({ beforeTs, limit });
      return res.json(blocks);
    } catch (error) {
      metrics.firebaseErrors += 1;
      return res.status(503).json({ error: 'Historical blocks unavailable', message: error.message });
    }
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
