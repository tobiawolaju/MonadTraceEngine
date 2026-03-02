import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initFirebase } from './services/firebase.js';
import { ChainStore } from './store/chainStore.js';
import { IngestionService } from './services/ingestionService.js';
import { WsHub } from './services/wsHub.js';

initFirebase();
const store = new ChainStore();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('/api/blocks', (req, res) => {
  const blocks = store.getWindowBlocks();
  const { nodeId, fromHeight, toHeight } = req.query;
  const filtered = blocks.filter((b) => {
    if (nodeId && b.nodeId !== nodeId) return false;
    if (fromHeight && b.blockHeight < Number(fromHeight)) return false;
    if (toHeight && b.blockHeight > Number(toHeight)) return false;
    return true;
  });
  res.json(filtered);
});

app.get('/api/blocks/:hash', (req, res) => {
  const block = store.getBlockByHash(req.params.hash);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  res.json(block);
});

app.get('/api/transactions/:txHash', (req, res) => {
  const tx = store.getTransaction(req.params.txHash);
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
});

app.get('/api/holders/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const txs = store
    .getWindowBlocks()
    .flatMap((b) => b.transactions.map((tx) => ({ ...tx, blockHeight: b.blockHeight, nodeId: b.nodeId })))
    .filter((tx) => tx.from?.toLowerCase() === addr || tx.to?.toLowerCase() === addr);
  res.json({ address: req.params.address, transactions: txs });
});

const server = http.createServer(app);
const wsHub = new WsHub(server, config.broadcastWindowMs);
const ingestion = new IngestionService(config.nodes, store, (block) => wsHub.enqueue(block));

ingestion.start();

server.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});

process.on('SIGINT', () => {
  ingestion.stop();
  wsHub.close();
  server.close(() => process.exit(0));
});
