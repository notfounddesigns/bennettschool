<script setup lang="ts">
import { useAppStore } from '../stores/app'
const app = useAppStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="snackbar">
      <div
        v-if="app.snackbar.visible"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-[8px] font-sans text-[13px] font-medium shadow-[var(--shadow-lg)] whitespace-nowrap z-[9999]"
        :class="{
          'bg-charcoal text-cream': app.snackbar.type === 'default',
          'bg-sage text-sage-light': app.snackbar.type === 'success',
          'bg-app-error text-white': app.snackbar.type === 'error',
        }"
      >
        <div v-if="app.snackbar.type === 'success'" class="flex gap-2 items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>{{ app.snackbar.message }}</span>
        </div>
        <div v-else-if="app.snackbar.type === 'error'" class="flex gap-2 items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ app.snackbar.message }}</span>
        </div>
        <span v-else>{{ app.snackbar.message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
