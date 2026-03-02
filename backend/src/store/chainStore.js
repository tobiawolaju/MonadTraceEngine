import { config } from '../config/index.js';
import { persistBlock, removeBlock } from '../services/firebase.js';

export class ChainStore {
  constructor() {
    this.nodeBlocks = new Map();
    this.heightIndex = new Map();
  }

  getNodeChain(nodeId) {
    if (!this.nodeBlocks.has(nodeId)) this.nodeBlocks.set(nodeId, []);
    return this.nodeBlocks.get(nodeId);
  }

  getLatest(nodeId) {
    const chain = this.getNodeChain(nodeId);
    return chain[chain.length - 1];
  }

  async upsertBlock(block) {
    const chain = this.getNodeChain(block.nodeId);
    const latest = chain[chain.length - 1];

    if (latest && block.parentHash !== latest.hash) {
      await this.rollbackToParent(block.nodeId, block.parentHash);
    }

    block.status = 'canonical';
    chain.push(block);
    if (!this.heightIndex.has(block.blockHeight)) this.heightIndex.set(block.blockHeight, []);
    this.heightIndex.get(block.blockHeight).push(block);

    await persistBlock(block);
    await this.evictOldBlocks();

    return block;
  }

  async rollbackToParent(nodeId, parentHash) {
    const chain = this.getNodeChain(nodeId);
    while (chain.length && chain[chain.length - 1].hash !== parentHash) {
      const removed = chain.pop();
      removed.status = 'rolled-back';
      await persistBlock(removed);
      await removeBlock(removed);
    }
  }

  async evictOldBlocks() {
    const cutoff = Date.now() - config.keepWindowMs;
    for (const [nodeId, chain] of this.nodeBlocks.entries()) {
      while (chain.length && chain[0].timestamp < cutoff) {
        const old = chain.shift();
        await removeBlock(old);
      }
      this.nodeBlocks.set(nodeId, chain.slice(-config.rollbackWindow));
    }
  }

  getWindowBlocks() {
    const blocks = [];
    for (const chain of this.nodeBlocks.values()) blocks.push(...chain);
    return blocks.sort((a, b) => a.blockHeight - b.blockHeight);
  }

  getBlockByHash(hash) {
    return this.getWindowBlocks().find((b) => b.hash === hash);
  }

  getTransaction(txHash) {
    for (const block of this.getWindowBlocks()) {
      const tx = block.transactions.find((t) => t.txHash === txHash);
      if (tx) return { ...tx, blockHash: block.hash, blockHeight: block.blockHeight, nodeId: block.nodeId };
    }
    return null;
  }
}
