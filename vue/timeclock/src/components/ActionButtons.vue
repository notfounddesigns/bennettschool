<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div class="flex flex-col gap-2.5">

    <!-- Clock In — shown when clocked out -->
    <button
      v-if="tc.clockStatus === 'clocked_out'"
      @click="tc.doClockIn()"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-sage text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      <template v-if="tc.actionLoading">
        <span class="spinner" />Clocking in…
      </template>
      <template v-else>Clock In</template>
    </button>

    <!-- Start Break — shown when clocked in -->
    <button
      v-if="tc.clockStatus === 'clocked_in'"
      @click="tc.doStartBreak()"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-blush text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      <template v-if="tc.actionLoading"><span class="spinner" />…</template>
      <template v-else>Start Break</template>
    </button>

    <!-- Clock Out — shown when clocked in -->
    <button
      v-if="tc.clockStatus === 'clocked_in'"
      @click="tc.doClockOut()"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] border border-app-border text-charcoal font-medium text-[15px] cursor-pointer hover:bg-cream active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      <template v-if="tc.actionLoading"><span class="spinner text-muted" />…</template>
      <template v-else>Clock Out</template>
    </button>

    <!-- End Break — shown when on break -->
    <button
      v-if="tc.clockStatus === 'on_break'"
      @click="tc.doEndBreak()"
      :disabled="tc.actionLoading"
      class="w-full h-12 rounded-[10px] bg-sage text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      <template v-if="tc.actionLoading"><span class="spinner" />Ending break…</template>
      <template v-else>End Break</template>
    </button>

    <!-- Cancel -->
    <button
      @click="tc.reset()"
      :disabled="tc.actionLoading"
      class="w-full h-9 text-muted text-[13px] cursor-pointer hover:text-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Cancel
    </button>
  </div>
</template>
