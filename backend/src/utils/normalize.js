function asNullableString(value) {
  if (value === undefined || value === null) return null;
  return String(value);
}

/**
 * Normalize a transaction into a strict RTDB-safe schema.
 *
 * Accepted inputs:
 *  - transaction hash string
 *  - transaction object from RPC
 */
export function normalizeTransaction(tx) {
  let hash = null;

  if (typeof tx === 'string') {
    hash = tx;
  } else if (tx && typeof tx === 'object') {
    hash = tx.hash ?? null;
  }

  // Skip invalid transactions explicitly (caller logs context).
  if (!hash) return null;

  return {
    hash: String(hash),
    from: asNullableString(tx?.from),
    to: asNullableString(tx?.to),
    value: asNullableString(tx?.value),
    status: asNullableString(tx?.status)
  };
}

export function normalizeBlock(nodeId, block, transactions) {
  return {
    nodeId: String(nodeId),
    blockHeight: Number(block.number),
    timestamp: Number(block.timestamp) * 1000,
    hash: String(block.hash),
    parentHash: String(block.parentHash),
    transactions,
    status: 'pending'
  };
}

/**
 * Recursively sanitize payloads for Firebase RTDB.
 * RTDB rejects `undefined`, so convert all undefined to null.
 */
export function sanitizeForRTDB(input) {
  if (input === undefined) return null;
  if (input === null) return null;

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForRTDB(item));
  }

  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = sanitizeForRTDB(value);
    }
    return out;
  }

  return input;
}
