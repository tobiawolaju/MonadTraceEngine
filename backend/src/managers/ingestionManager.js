import { TaskQueue } from './queueManager.js';
import { config } from '../config/index.js';
import { extractTrace } from '../services/traceService.js';

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
      gasUsed: null,
      parallelIndex: null,
      threadId: null,
      opcodes: [],
      internalCalls: []
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
    input: tx.input ? String(tx.input) : null,
    parallelIndex: null,
    threadId: null,
    opcodes: [],
    internalCalls: []
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
    parallelIndex: index,
    threadId: `thread-${index % 8}`,
    opcodes: [],
    internalCalls: [],
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
    this.nodeState = new Map();
    this.blockByHash = new Map();
    this.txByHash = new Map();
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

  getLatestBlocksByNode() {
    const latestByNode = new Map();
    for (const block of this.blocks) {
      const current = latestByNode.get(block.nodeId);
      if (!current || block.blockHeight > current.blockHeight) {
        latestByNode.set(block.nodeId, block);
      }
    }
    return [...latestByNode.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }

  getNodeStatuses() {
    const now = Date.now();
    return this.rpcManager.getNodeClients().map((node) => {
      const state = this.nodeState.get(node.nodeId) || {};
      const latestSeen = this.lastSeenBlock.get(node.nodeId) ?? null;
      const latestProcessed = this.latestProcessedBlock.get(node.nodeId) ?? null;
      const lagBlocks =
        latestSeen !== null && latestProcessed !== null ? Math.max(0, latestSeen - latestProcessed) : null;
      const queue = this.blockQueues.get(node.nodeId);
      const disabledForMs = Math.max(0, (node.disabledUntil || 0) - now);

      return {
        nodeId: node.nodeId,
        rpc: node.rpc,
        latestSeenBlock: latestSeen,
        latestProcessedBlock: latestProcessed,
        lagBlocks,
        queueDepth: queue?.depth ?? 0,
        queuePaused: queue?.paused ?? false,
        lastPollAt: state.lastPollAt ?? null,
        lastProcessedAt: state.lastProcessedAt ?? null,
        lastErrorAt: state.lastErrorAt ?? null,
        lastErrorMessage: state.lastErrorMessage ?? null,
        isDisabled: disabledForMs > 0,
        disabledForMs
      };
    });
  }

  getNetworkOverview() {
    const latestByNode = this.getLatestBlocksByNode();
    const nodes = this.getNodeStatuses();
    const consensusHashSet = new Set(latestByNode.map((b) => b.hash));
    const highestSeen = Math.max(...nodes.map((n) => n.latestSeenBlock ?? 0), 0);
    const highestProcessed = Math.max(...nodes.map((n) => n.latestProcessedBlock ?? 0), 0);

    return {
      generatedAt: Date.now(),
      nodeCount: nodes.length,
      highestSeenBlock: highestSeen || null,
      highestProcessedBlock: highestProcessed || null,
      latestHeadHashes: [...consensusHashSet],
      headsAgree: consensusHashSet.size <= 1,
      nodes
    };
  }

  getBlockByHash(hash) {
    return this.blockByHash.get(hash) || null;
  }

  getTransaction(txHash) {
    return this.txByHash.get(txHash) || null;
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
      this.nodeState.set(node.nodeId, {});

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
        this.#setNodeError(node.nodeId, error);
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
    this.#setNodeState(node.nodeId, { lastPollAt: Date.now() });

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
          let trace = buildTraceStub(tx, index);
          try {
            const extracted = await extractTrace(node.provider, tx.hash, index);
            trace = {
              ...trace,
              ...extracted,
              opcodeSummary: {
                ...trace.opcodeSummary,
                ...(extracted.opcodeSummary || {}),
                opcodeCount: Array.isArray(extracted.opcodes)
                  ? extracted.opcodes.length
                  : trace.opcodeSummary.opcodeCount
              },
              executionMetadata: {
                ...trace.executionMetadata,
                ...(extracted.executionMetadata || {})
              }
            };
          } catch {
            // Keep stub trace data when trace extraction fails.
          }

          tracesByTxHash[tx.hash] = trace;
          tx.parallelIndex = trace.parallelIndex;
          tx.threadId = trace.threadId;
          tx.opcodes = trace.opcodes;
          tx.internalCalls = trace.internalCalls;
        })
      )
    );

    try {
      await this.firebaseManager.writeBlockBundle(block, tracesByTxHash);
    } catch (error) {
      this.metrics.firebaseErrors += 1;
      this.#setNodeError(node.nodeId, error);
      return;
    }

    this.latestProcessedBlock.set(node.nodeId, block.blockHeight);
    this.#setNodeState(node.nodeId, { lastProcessedAt: Date.now(), lastErrorAt: null, lastErrorMessage: null });
    this.reorgManager.append(node.nodeId, block);
    this.#rememberBlock(block);
    this.onCanonicalBlock(block);
    this.metrics.blocksProcessed += 1;
  }

  #rememberBlock(block) {
    this.blocks.push(block);
    this.blockByHash.set(block.hash, block);
    for (const tx of block.transactions) {
      this.txByHash.set(tx.hash, {
        ...tx,
        blockHeight: block.blockHeight,
        blockHash: block.hash,
        nodeId: block.nodeId
      });
    }

    while (this.blocks.length > config.maxInMemoryBlocks) {
      const old = this.blocks.shift();
      if (!old) continue;
      this.blockByHash.delete(old.hash);
      for (const tx of old.transactions) {
        const existing = this.txByHash.get(tx.hash);
        if (existing?.blockHash === old.hash) this.txByHash.delete(tx.hash);
      }
    }
  }

  #setNodeState(nodeId, patch) {
    const prev = this.nodeState.get(nodeId) || {};
    this.nodeState.set(nodeId, { ...prev, ...patch });
  }

  #setNodeError(nodeId, error) {
    this.#setNodeState(nodeId, {
      lastErrorAt: Date.now(),
      lastErrorMessage: error?.message || String(error)
    });
  }
}
