export function normalizeBlock(nodeId, block, transactions) {
  return {
    nodeId,
    blockHeight: Number(block.number),
    timestamp: Number(block.timestamp) * 1000,
    hash: block.hash,
    parentHash: block.parentHash,
    transactions,
    status: 'pending'
  };
}

export function normalizeTx(tx, trace, parallelIndex = 0) {
  return {
    txHash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value?.toString?.() ?? String(tx.value ?? '0'),
    opcodes: trace?.opcodes ?? [],
    internalCalls: trace?.internalCalls ?? [],
    parallelIndex,
    threadId: trace?.threadId ?? `thread-${parallelIndex}`
  };
}
