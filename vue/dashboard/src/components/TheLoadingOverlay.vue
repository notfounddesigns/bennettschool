<script setup lang="ts">
import { useAppStore } from '../stores/app'
const app = useAppStore()
</script>

<template>
  <Teleport to="body">
    <div v-if="app.globalLoading" class="global-loading-overlay" aria-hidden="true">
      <div class="global-spinner" />
    </div>
  </Teleport>
</template>
