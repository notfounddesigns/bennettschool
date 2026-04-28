<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div class="text-center mb-6">
    <div class="w-16 h-16 rounded-full bg-blush text-white flex items-center justify-center font-bold text-xl mx-auto mb-3">
      {{ tc.studentInitials }}
    </div>
    <div class="text-[19px] font-semibold text-charcoal">{{ tc.student?.name ?? '' }}</div>
    <div class="text-[13px] text-muted mt-1">{{ tc.statusLabel }}</div>
  </div>
</template>
