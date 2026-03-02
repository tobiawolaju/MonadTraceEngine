<script>
  import { onDestroy, onMount, tick } from 'svelte';

  export let blocks = [];
  export let onSelect = () => {};

  const statusColors = {
    canonical: '#22c55e',
    pending: '#facc15',
    'rolled-back': '#f97316'
  };
  const rowHeight = 72;
  const blockSize = 30;
  const blockRadius = 9;
  const targetTickCount = 9;
  const tickStepsMs = [5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000];

  let nowMs = Date.now();
  let scroller;
  let followLive = true;
  let lastKnownBlockCount = 0;
  let nowTimer;

  const sortedBlocks = (items) =>
    [...items].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;
      return a.hash.localeCompare(b.hash);
    });

  const nodeSort = (a, b) => {
    const aNum = Number(a.replace(/\D+/g, ''));
    const bNum = Number(b.replace(/\D+/g, ''));
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b);
  };

  const ago = (timestamp, now) => {
    const delta = Math.max(0, now - timestamp);
    if (delta < 60000) return `${Math.floor(delta / 1000)} sec ago`;
    if (delta < 3600000) return `${Math.floor(delta / 60000)} min ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)} hr ago`;
    return `${Math.floor(delta / 86400000)} day ago`;
  };

  const pickTickStep = (spanMs) => {
    for (const step of tickStepsMs) {
      if (spanMs / step <= targetTickCount) return step;
    }
    return tickStepsMs[tickStepsMs.length - 1];
  };

  const colorFor = (status) => statusColors[status] || '#94a3b8';
  const shortHash = (hash) => (hash ? `${hash.slice(0, 8)}...` : 'N/A');

  function jumpToLiveEdge() {
    if (!scroller) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }

  function handleScroll() {
    if (!scroller) return;
    const remaining = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
    if (remaining > 120) followLive = false;
  }

  $: nodeIds = [...new Set(blocks.map((b) => b.nodeId))].sort(nodeSort);
  $: timeValues = blocks.map((b) => Number(b.timestamp)).filter((t) => Number.isFinite(t));
  $: minTime = timeValues.length ? Math.min(...timeValues) : nowMs - 300000;
  $: maxTime = timeValues.length ? Math.max(...timeValues, nowMs) : nowMs;
  $: spanMs = Math.max(60000, maxTime - minTime);
  $: timelineWidth = Math.max(1200, Math.round((spanMs / 1000) * 1.1));
  $: toX = (timestamp) => ((timestamp - minTime) / spanMs) * timelineWidth;

  $: rows = nodeIds.map((nodeId) => {
    const positioned = sortedBlocks(blocks.filter((b) => b.nodeId === nodeId)).map((block) => ({
      ...block,
      x: toX(block.timestamp)
    }));

    const connectors = positioned.slice(1).map((block, index) => {
      const previous = positioned[index];
      const left = previous.x + blockSize / 2;
      const right = block.x - blockSize / 2;
      return {
        left,
        width: Math.max(8, right - left),
        status: block.status
      };
    });

    return { nodeId, blocks: positioned, connectors };
  });

  $: tickStep = pickTickStep(spanMs);
  $: firstTick = Math.ceil(minTime / tickStep) * tickStep;
  $: ticks = (() => {
    const values = [];
    for (let ts = firstTick; ts <= maxTime; ts += tickStep) values.push(ts);
    return values;
  })();

  $: if (followLive && scroller && blocks.length !== lastKnownBlockCount) {
    lastKnownBlockCount = blocks.length;
    tick().then(jumpToLiveEdge);
  }

  onMount(() => {
    nowTimer = setInterval(() => {
      nowMs = Date.now();
    }, 10000);
  });

  onDestroy(() => {
    clearInterval(nowTimer);
  });
</script>

<div class="legend">
  <span><i class="dot canonical"></i>Canonical</span>
  <span><i class="dot pending"></i>Pending</span>
  <span><i class="dot rolled-back"></i>Rolled Back</span>
  <button class="live-btn" on:click={() => { followLive = true; jumpToLiveEdge(); }}>
    {followLive ? 'Following Live' : 'Jump To Live'}
  </button>
</div>

<div class="board">
  <div class="left-column">
    <div class="corner">Nodes</div>
    {#each rows as row}
      <div class="node-label">{row.nodeId}</div>
    {/each}
  </div>

  <div class="timeline-scroll" bind:this={scroller} on:scroll={handleScroll}>
    <div class="timeline-header" style={`width:${timelineWidth}px`}>
      {#each ticks as t}
        <div class="tick" style={`left:${toX(t)}px`}>
          <span>{ago(t, nowMs)}</span>
        </div>
      {/each}
    </div>

    {#each rows as row}
      <div class="track" style={`width:${timelineWidth}px; height:${rowHeight}px`}>
        {#each row.connectors as connector}
          <div
            class="connector"
            style={`left:${connector.left}px; width:${connector.width}px; background:${colorFor(connector.status)}`}
          ></div>
        {/each}

        {#each row.blocks as block}
          <button
            class="block status-{block.status}"
            style={`left:${block.x - blockSize / 2}px; width:${blockSize}px; height:${blockSize}px; border-radius:${blockRadius}px`}
            title={`${block.nodeId} #${block.blockHeight} (${block.status})`}
            on:click={() => onSelect(block)}
          >
            <span>{block.blockHeight}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .legend {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 0.83rem;
    margin-bottom: 12px;
    color: #d4e4f8;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 99px;
    margin-right: 6px;
  }

  .dot.canonical {
    background: #22c55e;
  }

  .dot.pending {
    background: #facc15;
  }

  .dot.rolled-back {
    background: #f97316;
  }

  .live-btn {
    margin-left: auto;
    border: 1px solid #334155;
    background: #0f172a;
    color: #dbeafe;
    font: inherit;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .board {
    display: grid;
    grid-template-columns: 180px 1fr;
    border: 1px solid #1f2937;
    border-radius: 14px;
    overflow: hidden;
    background:
      radial-gradient(circle at 10% 10%, #1e293b 0%, transparent 40%),
      radial-gradient(circle at 90% 80%, #172554 0%, transparent 45%),
      #020617;
  }

  .left-column {
    border-right: 1px solid #1f2937;
    background: linear-gradient(180deg, #0b1222 0%, #070d1a 100%);
  }

  .corner {
    height: 54px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9cb5d2;
    border-bottom: 1px solid #1f2937;
  }

  .node-label {
    height: 72px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    border-bottom: 1px solid #0f172a;
    font-weight: 600;
    color: #dbeafe;
  }

  .timeline-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-color: #334155 #0b1222;
    scrollbar-width: thin;
  }

  .timeline-header {
    position: relative;
    height: 54px;
    border-bottom: 1px solid #1f2937;
    background: linear-gradient(180deg, #0d1a30 0%, #081225 100%);
  }

  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #334155;
  }

  .tick span {
    position: absolute;
    top: 8px;
    left: 6px;
    white-space: nowrap;
    color: #9cb5d2;
    font-size: 0.74rem;
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .track {
    position: relative;
    border-bottom: 1px solid #0f172a;
  }

  .connector {
    position: absolute;
    top: calc(50% - 2px);
    height: 4px;
    border-radius: 8px;
    opacity: 0.7;
  }

  .block {
    position: absolute;
    top: calc(50% - 15px);
    border: 1px solid #0f172a;
    color: #0b1220;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 110ms ease, box-shadow 110ms ease;
  }

  .block span {
    font-size: 0.58rem;
    padding: 0 2px;
  }

  .block:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 18px rgba(2, 6, 23, 0.55);
  }

  .status-canonical {
    background: #22c55e;
  }

  .status-pending {
    background: #facc15;
  }

  .status-rolled-back {
    background: #f97316;
  }
</style>
