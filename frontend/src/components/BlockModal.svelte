<script>
  import { parseOpcodes } from '../wasmTrace';
  export let block = null;
  export let onClose = () => {};
</script>

{#if block}
  <div class="overlay" on:click={onClose}>
    <div class="modal" on:click|stopPropagation>
      <h3>Block {block.blockHeight}</h3>
      <p><strong>Node:</strong> {block.nodeId}</p>
      <p><strong>Hash:</strong> {block.hash}</p>
      <p><strong>Timestamp:</strong> {new Date(block.timestamp).toLocaleString()}</p>
      <p><strong>Status:</strong> {block.status}</p>

      <h4>Transactions</h4>
      <div class="tx-list">
        {#each block.transactions as tx}
          <div class="tx-card">
            <div><strong>{tx.txHash}</strong></div>
            <div>parallelIndex: {tx.parallelIndex} ({tx.threadId})</div>
            <div>Opcodes: {parseOpcodes(tx.opcodes).slice(0, 16).join(', ') || 'N/A'}</div>
            <div>Internal calls: {tx.internalCalls.length}</div>
          </div>
        {/each}
      </div>
      <button on:click={onClose}>Close</button>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; }
  .modal { width: min(900px, 90vw); max-height: 80vh; overflow: auto; background: #fff; padding: 1rem; border-radius: 10px; }
  .tx-card { border: 1px solid #ddd; margin: .4rem 0; padding: .5rem; border-radius: 6px; }
</style>
