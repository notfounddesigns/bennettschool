<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div v-if="tc.showingCountdown" class="h-0.75 bg-app-border overflow-hidden rounded-b-card">
    <div
      class="h-full bg-blush"
      :style="{ width: tc.countdownProgress + '%', transition: 'width 50ms linear' }"
    />
  </div>
</template>
