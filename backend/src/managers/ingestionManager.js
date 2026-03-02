import { TaskQueue } from './queueManager.js';
import { config } from '../config/index.js';

function toHexHeight(height) {
  return `0x${Number(height).toString(16)}`;
}

function normalizeTransaction(tx) {
  if (typeof tx === 'string') {
    return {
      hash: tx,
      from: null,
      to: null,
      value: null,
      status: null,
      gasUsed: null
    };
  }

  if (!tx?.hash) return null;

  return {
    hash: String(tx.hash),
    from: tx.from ? String(tx.from) : null,
    to: tx.to ? String(tx.to) : null,
    value: tx.value !== undefined && tx.value !== null ? String(tx.value) : null,
    status: tx.blockHash ? 'confirmed' : null,
    gasUsed: tx.gas ? String(tx.gas) : null,
    input: tx.input ? String(tx.input) : null
  };
}

function normalizeBlock(nodeId, block) {
  const transactions = [];
  for (const rawTx of block.transactions || []) {
    const tx = normalizeTransaction(rawTx);
    if (tx?.hash) transactions.push(tx);
  }

  return {
    nodeId,
    blockHeight: Number(block.number),
    hash: String(block.hash),
    parentHash: String(block.parentHash),
    timestamp: Number(block.timestamp) * 1000,
    transactions,
    status: 'canonical'
  };
}

function buildTraceStub(tx, index) {
  return {
    opcodeSummary: {
      approxInputBytes: tx.input ? Math.max(0, (tx.input.length - 2) / 2) : 0,
      opcodeCount: 0
    },
    executionMetadata: {
      from: tx.from,
      to: tx.to,
      value: tx.value
    },
    parallelGroup: index % 8
  };
}

export class IngestionManager {
  constructor({ rpcManager, firebaseManager, reorgManager, metrics, onCanonicalBlock }) {
    this.rpcManager = rpcManager;
    this.firebaseManager = firebaseManager;
    this.reorgManager = reorgManager;
    this.metrics = metrics;
    this.onCanonicalBlock = onCanonicalBlock;

    this.latestProcessedBlock = new Map();
    this.lastSeenBlock = new Map();
    this.blockByHash = new Map();
    this.blocks = [];

    this.traceQueue = new TaskQueue({
      concurrency: config.ingestion.traceConcurrency,
      maxSize: config.ingestion.maxQueueSize,
      name: 'trace-global'
    });

    this.blockQueues = new Map();
    this.stopped = false;
    this.pollTimers = [];
  }

  getWindowBlocks() {
    return [...this.blocks].sort((a, b) => a.blockHeight - b.blockHeight);
  }

  getBlockByHash(hash) {
    return this.blockByHash.get(hash) || null;
  }

  getTransaction(txHash) {
    for (const block of this.blocks) {
      const tx = block.transactions.find((item) => item.hash === txHash);
      if (tx) return { ...tx, blockHeight: block.blockHeight, blockHash: block.hash, nodeId: block.nodeId };
    }
    return null;
  }

  async startIngestion() {
    for (const node of this.rpcManager.getNodeClients()) {
      this.blockQueues.set(
        node.nodeId,
        new TaskQueue({
          concurrency: config.ingestion.perNodeBlockConcurrency,
          maxSize: config.ingestion.maxQueueSize,
          name: `blocks-${node.nodeId}`
        })
      );

      this.#attachNode(node);
    }
  }

  stop() {
    this.stopped = true;
    for (const timer of this.pollTimers) clearInterval(timer);
  }

  #attachNode(node) {
    if (node.rpc.startsWith('ws')) {
      node.provider.on('block', async (height) => {
        if (this.stopped) return;
        await this.#scheduleHeight(node, Number(height));
      });
      node.provider.on('error', () => this.#startPollingFallback(node));
      return;
    }

    this.#startPollingFallback(node);
  }

  #startPollingFallback(node) {
    const timer = setInterval(async () => {
      if (this.stopped) return;
      try {
        const [latestHex] = await this.rpcManager.batchRpcCall(node, [{ method: 'eth_blockNumber', params: [] }]);
        const latest = Number.parseInt(latestHex, 16);
        const lastSeen = this.lastSeenBlock.get(node.nodeId) ?? latest - 1;

        if (latest <= lastSeen) return;

        const heights = [];
        for (let h = lastSeen + 1; h <= latest; h += 1) heights.push(h);
        this.lastSeenBlock.set(node.nodeId, latest);

        for (const height of heights) {
          await this.#scheduleHeight(node, height);
        }
      } catch (error) {
        this.metrics.rpcErrors += 1;
      }
    }, config.ingestion.pollIntervalMs);

    this.pollTimers.push(timer);
  }

  async #scheduleHeight(node, height) {
    const queue = this.blockQueues.get(node.nodeId);
    if (!queue.hasCapacity()) {
      queue.pause();
      this.metrics.backpressurePauses += 1;
      return;
    }

    if (queue.paused && queue.depth < Math.floor(config.ingestion.maxQueueSize * 0.7)) queue.resume();

    await queue.push(() => this.#processHeight(node, height), { retries: 2, retryDelayMs: 500 });
  }

  async #processHeight(node, height) {
    const [rawBlock] = await this.rpcManager.batchRpcCall(node, [
      {
        method: 'eth_getBlockByNumber',
        params: [toHexHeight(height), true]
      }
    ]);

    if (!rawBlock) return;

    const block = normalizeBlock(node.nodeId, rawBlock);

    await this.reorgManager.detectReorg(node.nodeId, block);

    const tracesByTxHash = {};
    await Promise.all(
      block.transactions.map((tx, index) =>
        this.traceQueue.push(async () => {
          tracesByTxHash[tx.hash] = buildTraceStub(tx, index);
        })
      )
    );

    try {
      await this.firebaseManager.writeBlockBundle(block, tracesByTxHash);
    } catch (error) {
      this.metrics.firebaseErrors += 1;
      return;
    }

    this.latestProcessedBlock.set(node.nodeId, block.blockHeight);
    this.reorgManager.append(node.nodeId, block);
    this.#rememberBlock(block);
    this.onCanonicalBlock(block);
    this.metrics.blocksProcessed += 1;
  }

  #rememberBlock(block) {
    this.blocks.push(block);
    this.blockByHash.set(block.hash, block);

    while (this.blocks.length > 5000) {
      const old = this.blocks.shift();
      if (old) this.blockByHash.delete(old.hash);
    }
  }
}
