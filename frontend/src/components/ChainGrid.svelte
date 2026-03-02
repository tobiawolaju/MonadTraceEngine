<script>
  export let blocks = [];
  export let onSelect = () => {};
  const color = (status) => ({ canonical: '#19c37d', 'rolled-back': '#ef4444', pending: '#facc15' }[status] || '#94a3b8');
</script>

<div class="grid-wrap">
  <div class="header">Canonical chain highlighted in green. Click blocks for details.</div>
  {#each blocks as block}
    <button class="block" style={`background:${color(block.status)}`} on:click={() => onSelect(block)}>
      <div>{block.nodeId}</div>
      <strong>#{block.blockHeight}</strong>
      <small>{block.hash.slice(0, 8)}...</small>
    </button>
  {/each}
</div>

<style>
  .grid-wrap { display:grid; grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); gap:.6rem; }
  .block { border:none; color:#111; padding:.6rem; border-radius:8px; text-align:left; cursor:pointer; }
  .header { grid-column: 1 / -1; font-size: .9rem; color:#475569; margin-bottom:.2rem; }
</style>
