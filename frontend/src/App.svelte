<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';

  let blocks = [];
  let selectedBlock = null;

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

  async function handleSelectBlock(block) {
    selectedBlock = block;
    try {
      const res = await fetch(`${apiBase}/api/blocks/${block.hash}`);
      if (!res.ok) return;
      const fullBlock = await res.json();
      selectedBlock = fullBlock;
    } catch {
      // Keep the already selected local block if network request fails.
    }
  }

  onMount(async () => {
    await loadWindow();
    const ws = new WebSocket('ws://localhost:4000/ws');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'blocks') applyLive(message.data);
    };

    return () => ws.close();
  });
</script>

<main>
  <ChainGrid blocks={blocks} onSelect={handleSelectBlock} />
  <BlockModal block={selectedBlock} onClose={() => (selectedBlock = null)} />
</main>

<style>
  :global(body) {
    margin: 0;
    background: #ffffff;
  }

  main {
    box-sizing: border-box;
    padding: 14px;
    color: #111827;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
  }

  @media (max-width: 720px) {
    main {
      padding: 12px;
    }
  }
</style>
