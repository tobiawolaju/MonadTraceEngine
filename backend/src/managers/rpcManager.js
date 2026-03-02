import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { config } from '../config/index.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async consume(count = 1) {
    while (true) {
      this.#refill();
      if (this.tokens >= count) {
        this.tokens -= count;
        return;
      }
      await sleep(25);
    }
  }

  #refill() {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs <= 0) return;
    const refill = (elapsedMs / 1000) * this.maxPerSecond;
    this.tokens = Math.min(this.maxPerSecond, this.tokens + refill);
    this.lastRefill = now;
  }
}

export class RpcManager {
  constructor(nodes, metrics) {
    this.metrics = metrics;
    this.nodes = nodes.map((node) => ({
      ...node,
      limiter: new RateLimiter(config.ingestion.maxRequestsPerSecondPerNode),
      disabledUntil: 0,
      provider: node.rpc.startsWith('ws') ? new WebSocketProvider(node.rpc) : new JsonRpcProvider(node.rpc)
    }));
  }

  getNodeClients() {
    return this.nodes;
  }

  async batchRpcCall(nodeClient, requests) {
    const batches = [];
    for (let i = 0; i < requests.length; i += config.ingestion.maxBatchSize) {
      batches.push(requests.slice(i, i + config.ingestion.maxBatchSize));
    }

    const results = [];
    for (const batch of batches) {
      const chunk = await this.#executeWithRetry(nodeClient, async () => {
        await nodeClient.limiter.consume(batch.length);

        if (nodeClient.rpc.startsWith('http')) {
          const payload = batch.map((r, idx) => ({ jsonrpc: '2.0', id: idx + 1, method: r.method, params: r.params }));
          const res = await fetch(nodeClient.rpc, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          const sorted = Array.isArray(data) ? data.sort((a, b) => a.id - b.id) : [data];
          return sorted.map((r) => {
            if (r.error) throw this.#asRpcError(r.error);
            return r.result;
          });
        }

        const out = [];
        for (const request of batch) {
          out.push(await nodeClient.provider.send(request.method, request.params));
        }
        return out;
      });

      results.push(...chunk);
    }

    return results;
  }

  async #executeWithRetry(nodeClient, fn) {
    if (Date.now() < nodeClient.disabledUntil) {
      throw new Error(`[rpc:${nodeClient.nodeId}] Node disabled temporarily`);
    }

    let attempt = 0;
    while (attempt < config.retry.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        this.metrics.rpcErrors += 1;
        const code = error?.code ?? error?.error?.code;
        if (code !== -32005) throw error;

        this.metrics.rateLimitEvents += 1;
        attempt += 1;
        const delay = Math.min(config.retry.baseBackoffMs * 2 ** (attempt - 1), config.retry.maxBackoffMs);
        await sleep(delay);
      }
    }

    nodeClient.disabledUntil = Date.now() + config.retry.disableNodeMs;
    throw new Error(`[rpc:${nodeClient.nodeId}] Disabled for ${config.retry.disableNodeMs}ms after repeated -32005`);
  }

  #asRpcError(errorPayload) {
    const error = new Error(errorPayload?.message || 'RPC error');
    error.code = errorPayload?.code;
    return error;
  }

  close() {
    for (const node of this.nodes) {
      node.provider.destroy();
    }
  }
}
