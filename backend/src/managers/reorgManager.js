export class ReorgManager {
  constructor({ windowSize = 20, onRollback, metrics }) {
    this.windowSize = windowSize;
    this.onRollback = onRollback;
    this.metrics = metrics;
    this.historyByNode = new Map();
  }

  getHistory(nodeId) {
    if (!this.historyByNode.has(nodeId)) this.historyByNode.set(nodeId, []);
    return this.historyByNode.get(nodeId);
  }

  async detectReorg(nodeId, newBlock) {
    const history = this.getHistory(nodeId);
    const latest = history[history.length - 1];
    if (!latest) return { reorg: false };

    if (newBlock.parentHash === latest.hash) return { reorg: false };

    this.metrics.reorgCount += 1;

    let rollbackStart = latest.blockHeight;
    while (history.length > 0 && history[history.length - 1].hash !== newBlock.parentHash) {
      rollbackStart = history[history.length - 1].blockHeight;
      history.pop();
    }

    await this.onRollback(nodeId, rollbackStart, latest.blockHeight);
    return { reorg: true, rollbackStart, rollbackEnd: latest.blockHeight };
  }

  append(nodeId, block) {
    const history = this.getHistory(nodeId);
    history.push({
      blockHeight: block.blockHeight,
      hash: block.hash,
      parentHash: block.parentHash
    });

    while (history.length > this.windowSize) history.shift();
  }

  async reapplyBlocks(nodeId, blocks, applyFn) {
    for (const block of blocks) {
      await applyFn(nodeId, block);
    }
  }
}
