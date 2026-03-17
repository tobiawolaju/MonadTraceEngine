<script>
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  onMount(() => {
    const timer = setTimeout(() => {
      dispatch('finish');
    }, 3000);
    return () => clearTimeout(timer);
  });
</script>

<div class="splash-screen">
  <div class="splash-content">
    <h1 class="splash-logo">Monad - Trace-- --Engine</h1>
  </div>
</div>
