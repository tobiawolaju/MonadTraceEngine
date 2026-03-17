<script>
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  onMount(() => {
    const timer = setTimeout(() => {
      dispatch('finish');
    }, 5000);
    return () => clearTimeout(timer);
  });
</script>

<div class="splash-screen">
  <div class="splash-content">
    <h1 class="splash-logo2">Moyaki</h1>
    <h1 class="splash-logo">Trace</h1>
    <h1 class="splash-logo">Engine</h1>
  </div>
</div>
