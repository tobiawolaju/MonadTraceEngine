<script>
  export let overview = null;
  export let nodes = [];

  const fmtAgo = (ts) => {
    if (!ts) return 'N/A';
    const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
    return `${Math.floor(deltaSec / 3600)}h ago`;
  };
</script>

<section class="panel">
  <div class="cards">
    <article>
      <h3>Heads</h3>
      <p>{overview?.headsAgree ? 'In Sync' : 'Diverged'}</p>
    </article>
    <article>
      <h3>Highest Seen</h3>
      <p>{overview?.highestSeenBlock ?? 'N/A'}</p>
    </article>
    <article>
      <h3>Highest Indexed</h3>
      <p>{overview?.highestProcessedBlock ?? 'N/A'}</p>
    </article>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Node</th>
          <th>Seen</th>
          <th>Indexed</th>
          <th>Lag</th>
          <th>Queue</th>
          <th>Last Indexed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#if !nodes.length}
          <tr>
            <td colspan="7" class="empty">No node data yet</td>
          </tr>
        {:else}
          {#each nodes as node}
            <tr>
              <td>{node.nodeId}</td>
              <td>{node.latestSeenBlock ?? 'N/A'}</td>
              <td>{node.latestProcessedBlock ?? 'N/A'}</td>
              <td>{node.lagBlocks ?? 'N/A'}</td>
              <td>{node.queueDepth}{node.queuePaused ? ' (paused)' : ''}</td>
              <td>{fmtAgo(node.lastProcessedAt)}</td>
              <td>
                {#if node.isDisabled}
                  <span class="pill down">Disabled</span>
                {:else if node.lastErrorAt}
                  <span class="pill warn">Error</span>
                {:else}
                  <span class="pill ok">Healthy</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>

<style>
  .panel {
    margin-bottom: 12px;
    border: 1px solid #d6d3d1;
    border-radius: 12px;
    background: linear-gradient(160deg, #fffaf0 0%, #fffbeb 100%);
    padding: 10px;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  article {
    border: 1px solid #e7e5e4;
    border-radius: 8px;
    padding: 8px;
    background: #ffffffb8;
  }

  h3 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #57534e;
  }

  p {
    margin: 4px 0 0;
    font-weight: 700;
    color: #1c1917;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th, td {
    text-align: left;
    border-bottom: 1px solid #e7e5e4;
    padding: 7px 6px;
    white-space: nowrap;
  }

  th {
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #57534e;
  }

  .pill {
    display: inline-block;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .pill.ok {
    background: #dcfce7;
    color: #14532d;
  }

  .pill.warn {
    background: #fef3c7;
    color: #92400e;
  }

  .pill.down {
    background: #fee2e2;
    color: #991b1b;
  }

  .empty {
    color: #78716c;
  }

  @media (max-width: 760px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
