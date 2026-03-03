<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';
  import NetworkOverview from './components/NetworkOverview.svelte';

  let blocks = [];
  let overview = null;
  let nodes = [];
  let selectedBlock = null;
  let highlightedHashes = [];
  let isPaused = false;
  let isFollowingLive = true;
  let historyLoading = false;
  let historyExhausted = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let highlightTimer = null;
  let syncTimer = null;
  let overviewTimer = null;
  let syncInFlight = false;
  let overviewInFlight = false;
  let ws = null;
  let shouldReconnect = true;

  const apiBase =
    import.meta.env.VITE_API_BASE ||
    `${window.location.protocol}//${window.location.hostname}:4000`;
  const wsBase = apiBase.replace(/^http/i, 'ws');
  const wsPath = import.meta.env.VITE_WS_PATH || '/ws';

  function toMsTimestamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  function normalizeBlock(block) {
    const timestamp = toMsTimestamp(block.timestamp);
    return timestamp === block.timestamp ? block : { ...block, timestamp };
  }

  function blockKey(block) {
    return `${block?.nodeId || 'unknown'}:${block?.hash || 'unknown'}`;
  }

  function mergeBlocks(items) {
    const byKey = new Map();
    for (const block of items.map(normalizeBlock)) {
      byKey.set(blockKey(block), block);
    }
    return [...byKey.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-15000);
  }

  async function loadWindow() {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const res = await fetch(`${apiBase}/api/blocks?limit=2000`);
      blocks = mergeBlocks(await res.json());
      sortBlocks();
    } finally {
      syncInFlight = false;
    }
  }

  async function loadHistory() {
    if (historyLoading || historyExhausted || !blocks.length) return;
    historyLoading = true;
    try {
      const oldestTs = Math.min(...blocks.map((b) => b.timestamp));
      const res = await fetch(`${apiBase}/api/blocks/history?beforeTs=${oldestTs}&limit=300`);
      if (!res.ok) return;
      const older = await res.json();
      if (!older.length) {
        historyExhausted = true;
        return;
      }
      blocks = mergeBlocks([...older, ...blocks]);
      sortBlocks();
    } finally {
      historyLoading = false;
    }
  }

  async function loadOverview() {
    if (overviewInFlight) return;
    overviewInFlight = true;
    try {
      const [overviewRes, nodesRes] = await Promise.all([
        fetch(`${apiBase}/api/network/overview`),
        fetch(`${apiBase}/api/nodes`)
      ]);
      if (overviewRes.ok) overview = await overviewRes.json();
      if (nodesRes.ok) nodes = await nodesRes.json();
    } finally {
      overviewInFlight = false;
    }
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
    const indexByKey = new Map(blocks.map((block, index) => [blockKey(block), index]));
    for (const incoming of nextBlocks) {
      const b = normalizeBlock(incoming);
      const key = blockKey(b);
      const idx = indexByKey.get(key);
      if (idx >= 0) blocks[idx] = b;
      else {
        indexByKey.set(key, blocks.length);
        blocks.push(b);
        addedHashes.push(key);
      }
    }
    blocks = mergeBlocks(blocks);
    sortBlocks();
    if (addedHashes.length) {
      highlightedHashes = [...new Set([...highlightedHashes, ...addedHashes])];
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        highlightedHashes = [];
      }, 1500);
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
    ws = new WebSocket(`${wsBase}${wsPath}`);

    ws.onopen = () => {
      reconnectAttempt = 0;
      // Backfill any blocks missed during reconnect gaps.
      loadWindow();
    };

    ws.onmessage = (event) => {
      if (isPaused) return;
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
    await loadOverview();
    connectWebSocket();
    // Tight periodic backfill to smooth out inconsistent WS delivery timing.
    syncTimer = setInterval(() => {
      if (!isPaused && isFollowingLive) loadWindow();
    }, 2000);
    overviewTimer = setInterval(loadOverview, 5000);
    return () => {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);
      clearTimeout(highlightTimer);
      clearInterval(syncTimer);
      clearInterval(overviewTimer);
      ws?.close();
    };
  });
</script>

<main>
  <NetworkOverview {overview} {nodes} />
  <ChainGrid
    blocks={blocks}
    onSelect={handleSelectBlock}
    highlightedHashes={highlightedHashes}
    isPaused={isPaused}
    isFollowingLive={isFollowingLive}
    historyLoading={historyLoading}
    onNeedHistory={loadHistory}
    onFollowLiveChange={(next) => {
      isFollowingLive = next;
      if (next) {
        historyExhausted = false;
        loadWindow();
      }
    }}
    onJumpToLive={() => {
      isFollowingLive = true;
      historyExhausted = false;
      loadWindow();
    }}
    onTogglePause={() => {
      isPaused = !isPaused;
      if (!isPaused && isFollowingLive) loadWindow();
    }}
  />
  <BlockModal block={selectedBlock} onClose={() => (selectedBlock = null)} />
</main>

<style>
  :global(body) {
    margin: 0;
    background: #ffffff;
  }

  main {
    box-sizing: border-box;
    padding: clamp(10px, 2vw, 16px);
    color: #111827;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
  }

  @media (max-width: 720px) {
    main {
      padding: 10px;
    }
  }
</style>
