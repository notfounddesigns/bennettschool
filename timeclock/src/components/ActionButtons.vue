<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <!-- Clock In — shown when clocked out -->
    <button
      v-if="tc.clockStatus === 'clocked_out'"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-sage text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 touch-manipulation"
      @click="tc.doClockIn()"
    >
      <span
        v-if="tc.actionLoading"
        class="inline-flex items-center gap-2"
      ><span class="spinner" />Clocking in…</span>
      <span v-else>Clock In</span>
    </button>

    <!-- Start Break — shown when clocked in -->
    <button
      v-if="tc.clockStatus === 'clocked_in'"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-blush text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 touch-manipulation"
      @click="tc.doStartBreak()"
    >
      <span
        v-if="tc.actionLoading"
        class="inline-flex items-center gap-2"
      ><span class="spinner" />…</span>
      <span v-else>Start Break</span>
    </button>

    <!-- Clock Out — shown when clocked in -->
    <button
      v-if="tc.clockStatus === 'clocked_in'"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] border border-app-border text-charcoal font-medium text-[15px] cursor-pointer hover:bg-cream active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 touch-manipulation"
      @click="tc.doClockOut()"
    >
      <span
        v-if="tc.actionLoading"
        class="inline-flex items-center gap-2"
      ><span class="spinner text-muted" />…</span>
      <span v-else>Clock Out</span>
    </button>

    <!-- End Break — shown when on break -->
    <button
      v-if="tc.clockStatus === 'on_break'"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-sage text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 touch-manipulation"
      @click="tc.doEndBreak()"
    >
      <span
        v-if="tc.actionLoading"
        class="inline-flex items-center gap-2"
      ><span class="spinner" />Ending break…</span>
      <span v-else>End Break</span>
    </button>

    <!-- Cancel -->
    <button
      :disabled="tc.actionLoading"
      class="w-full h-9 text-muted text-[13px] cursor-pointer hover:text-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
      @click="tc.reset()"
    >
      Cancel
    </button>
  </div>
</template>
