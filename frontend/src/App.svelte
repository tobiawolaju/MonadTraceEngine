<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';

  let blocks = [];
  let paused = false;
  let selectedBlock = null;
  let replayIndex = 0;
  let replayMode = false;

  const apiBase = 'http://localhost:4000';

  async function loadWindow() {
    const res = await fetch(`${apiBase}/api/blocks`);
    blocks = await res.json();
    sortBlocks();
  }

  function sortBlocks() {
    blocks = [...blocks].sort((a, b) => {
      if (a.status === 'canonical' && b.status !== 'canonical') return -1;
      if (a.status !== 'canonical' && b.status === 'canonical') return 1;
      if (a.nodeId === b.nodeId) return a.blockHeight - b.blockHeight;
      return a.nodeId.localeCompare(b.nodeId);
    });
  }

  function applyLive(nextBlocks) {
    for (const b of nextBlocks) {
      const idx = blocks.findIndex((x) => x.hash === b.hash);
      if (idx >= 0) blocks[idx] = b;
      else blocks.push(b);
    }
    const cutoff = Date.now() - 60 * 60 * 1000;
    blocks = blocks.filter((b) => b.timestamp >= cutoff);
    sortBlocks();
  }

  function stepReplay() {
    replayMode = true;
    replayIndex = Math.min(blocks.length - 1, replayIndex + 1);
  }

  $: replayBlocks = replayMode ? blocks.slice(0, replayIndex + 1) : blocks;

  onMount(async () => {
    await loadWindow();
    const ws = new WebSocket('ws://localhost:4000/ws');

    ws.onmessage = (event) => {
      if (paused) return;
      const message = JSON.parse(event.data);
      if (message.type === 'blocks') applyLive(message.data);
    };

    return () => ws.close();
  });
</script>

<main>
  <h1>Monad Execution Trace Indexer Dashboard</h1>
  <div class="controls">
    <button on:click={() => (paused = !paused)}>{paused ? 'Resume' : 'Pause'} Live</button>
    <button on:click={loadWindow}>Rewind 1h</button>
    <button on:click={stepReplay}>Replay Step</button>
  </div>

  <ChainGrid blocks={replayBlocks} onSelect={(b) => (selectedBlock = b)} />
  <BlockModal block={selectedBlock} onClose={() => (selectedBlock = null)} />
</main>

<style>
  main { font-family: Inter, system-ui, sans-serif; margin: 1rem; }
  .controls { display:flex; gap:.5rem; margin-bottom: 1rem; }
  button { padding: .4rem .7rem; }
</style>
