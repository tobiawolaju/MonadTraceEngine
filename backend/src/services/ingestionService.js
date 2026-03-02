import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { normalizeBlock, normalizeTx } from '../utils/normalize.js';
import { extractTrace } from './traceService.js';

function makeProvider(url) {
  if (url.startsWith('ws')) return new WebSocketProvider(url);
  return new JsonRpcProvider(url);
}

export class IngestionService {
  constructor(nodes, chainStore, onCanonicalBlock) {
    this.nodes = nodes;
    this.chainStore = chainStore;
    this.onCanonicalBlock = onCanonicalBlock;
    this.providers = [];
  }

  start() {
    for (const node of this.nodes) {
      const provider = makeProvider(node.rpc);
      this.providers.push(provider);
      provider.on('block', async (height) => {
        try {
          const block = await provider.getBlock(height, true);
          if (!block) return;
          const transactions = await Promise.all(
            (block.transactions || []).map(async (tx, index) => {
              const trace = await extractTrace(provider, tx.hash, index % 8);
              return normalizeTx(tx, trace, index % 8);
            })
          );

          const normalized = normalizeBlock(node.nodeId, block, transactions);
          const canonical = await this.chainStore.upsertBlock(normalized);
          this.onCanonicalBlock(canonical);
        } catch (error) {
          console.error(`[ingestion:${node.nodeId}]`, error.message);
        }
      });
    }
  }

  stop() {
    for (const provider of this.providers) provider.destroy();
  }
}
