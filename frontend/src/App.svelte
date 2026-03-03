<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';

  let blocks = [];
  let selectedBlock = null;
  let highlightedHashes = [];
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let highlightTimer = null;
  let pruneTimer = null;
  let ws = null;
  let shouldReconnect = true;
  const oneMinuteMs = 60 * 1000;

  const apiBase =
    import.meta.env.VITE_API_BASE ||
    `${window.location.protocol}//${window.location.hostname}:4000`;
  const wsBase = apiBase.replace(/^http/i, 'ws');

  function toMsTimestamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  function normalizeBlock(block) {
    const timestamp = toMsTimestamp(block.timestamp);
    return timestamp === block.timestamp ? block : { ...block, timestamp };
  }

  function keepRecent(items) {
    const cutoff = Date.now() - oneMinuteMs;
    return items
      .map(normalizeBlock)
      .filter((b) => b.timestamp >= cutoff);
  }

  async function loadWindow() {
    const res = await fetch(`${apiBase}/api/blocks`);
    blocks = keepRecent(await res.json());
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
    const addedHashes = [];
    for (const incoming of nextBlocks) {
      const b = normalizeBlock(incoming);
      const idx = blocks.findIndex((x) => x.hash === b.hash);
      if (idx >= 0) blocks[idx] = b;
      else {
        blocks.push(b);
        addedHashes.push(b.hash);
      }
    }
    blocks = keepRecent(blocks);
    sortBlocks();
    if (addedHashes.length) {
      highlightedHashes = [...new Set([...highlightedHashes, ...addedHashes])];
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        highlightedHashes = [];
      }, 1500);
    }
  }

  function pruneOldBlocks() {
    const next = keepRecent(blocks);
    if (next.length !== blocks.length) {
      blocks = next;
      sortBlocks();
    }
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

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connectWebSocket, delay);
  }

  function connectWebSocket() {
    ws = new WebSocket(`${wsBase}/ws`);

    ws.onopen = () => {
      reconnectAttempt = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'blocks') applyLive(message.data);
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onclose = () => {
      scheduleReconnect();
    };
  }

  onMount(async () => {
    shouldReconnect = true;
    await loadWindow();
    connectWebSocket();
    pruneTimer = setInterval(pruneOldBlocks, 5000);
    return () => {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);
      clearTimeout(highlightTimer);
      clearInterval(pruneTimer);
      ws?.close();
    };
  });
</script>

<main>
  <ChainGrid blocks={blocks} onSelect={handleSelectBlock} highlightedHashes={highlightedHashes} />
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
