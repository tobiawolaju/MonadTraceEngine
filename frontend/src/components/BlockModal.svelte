<script>
  import { parseOpcodes } from '../wasmTrace';
  export let block = null;
  export let onClose = () => {};

  const fmt = (value) => (value === null || value === undefined || value === '' ? 'N/A' : value);
  const fmtTimestamp = (value) => {
    const ts = Number(value);
    if (!Number.isFinite(ts)) return 'N/A';
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };
  const getOpcodeList = (opcodes) => {
    const parsed = parseOpcodes(opcodes);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      return parsed
        .split(',')
        .map((opcode) => opcode.trim())
        .filter(Boolean);
    }
    return [];
  };
</script>

{#if block}
  <div class="overlay" role="button" tabindex="0" on:click={onClose} on:keydown={(e) => e.key === 'Escape' && onClose()}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Block details" on:click|stopPropagation>
      <h3>Block Details</h3>
      <div class="meta-grid">
        <div><strong>Node</strong><span>{fmt(block.nodeId)}</span></div>
        <div><strong>Block Number</strong><span>{fmt(block.blockHeight)}</span></div>
        <div><strong>Status</strong><span>{fmt(block.status)}</span></div>
        <div><strong>Timestamp</strong><span>{fmtTimestamp(block.timestamp)}</span></div>
        <div class="full"><strong>Hash</strong><span>{fmt(block.hash)}</span></div>
        <div class="full"><strong>Parent Hash</strong><span>{fmt(block.parentHash)}</span></div>
        <div><strong>Transactions</strong><span>{block.transactions?.length || 0}</span></div>
      </div>

      <h4>Transactions</h4>
      <div class="tx-list">
        {#if !block.transactions?.length}
          <div class="tx-empty">No transactions in this block.</div>
        {:else}
          {#each block.transactions as tx}
            <div class="tx-card">
              <div><strong>Tx Hash:</strong> {fmt(tx?.txHash || tx?.hash)}</div>
              <div><strong>Parallel Index:</strong> {fmt(tx?.parallelIndex)} ({fmt(tx?.threadId)})</div>
              <div><strong>Opcodes:</strong> {getOpcodeList(tx?.opcodes).slice(0, 16).join(', ') || 'N/A'}</div>
              <div><strong>Internal Calls:</strong> {tx?.internalCalls?.length || 0}</div>
            </div>
          {/each}
        {/if}
      </div>
      <div class="actions">
        <button on:click={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    box-sizing: border-box;
  }

  .modal {
    width: min(980px, 100%);
    max-height: 85vh;
    overflow: auto;
    background: #fff;
    color: #111827;
    padding: 14px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
  }

  h3, h4 {
    margin: 0 0 10px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .meta-grid > div {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .meta-grid > div.full {
    grid-column: 1 / -1;
  }

  .meta-grid strong {
    font-size: 0.78rem;
    color: #4b5563;
  }

  .meta-grid span {
    word-break: break-word;
    font-size: 0.9rem;
  }

  .tx-card {
    border: 1px solid #e5e7eb;
    margin: 8px 0;
    padding: 8px;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .tx-empty {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px;
    color: #4b5563;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }

  button {
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .meta-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
