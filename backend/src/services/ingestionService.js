import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { normalizeBlock, normalizeTransaction } from '../utils/normalize.js';

function makeProvider(url) {
  if (url.startsWith('ws')) return new WebSocketProvider(url);
  return new JsonRpcProvider(url);
}

async function resolveTx(provider, tx) {
  if (typeof tx === 'string') {
    // Defensive fetch for hash-only blocks.
    return provider.getTransaction(tx);
  }
  return tx;
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
          if (!block) {
            console.warn(`[ingestion:${node.nodeId}] Missing block payload at height ${height}`);
            return;
          }

          const normalizedTransactions = [];
          for (const rawTx of block.transactions || []) {
            const txObject = await resolveTx(provider, rawTx);
            const normalized = normalizeTransaction(txObject ?? rawTx);

            if (!normalized) {
              console.warn(
                `[ingestion:${node.nodeId}] Skipping transaction without hash at block ${block.number}`
              );
              continue;
            }

            normalizedTransactions.push(normalized);
          }

          const normalizedBlock = normalizeBlock(node.nodeId, block, normalizedTransactions);
          const canonical = await this.chainStore.upsertBlock(normalizedBlock);
          this.onCanonicalBlock(canonical);
        } catch (error) {
          console.error(`[ingestion:${node.nodeId}] ${error.message}`);
        }
      });
    }
  }

  stop() {
    for (const provider of this.providers) provider.destroy();
  }
}
