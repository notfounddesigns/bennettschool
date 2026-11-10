<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div class="flex flex-col flex-1">
    <p class="text-[13px] text-muted text-center mb-5">
      Enter your 6-digit PIN
    </p>

    <!-- PIN dots -->
    <div class="flex justify-center gap-3 mb-6">
      <div
        v-for="i in [0, 1, 2, 3, 4, 5]"
        :key="i"
        class="w-4 h-4 rounded-full border-2 transition-all duration-150"
        :class="tc.pin.length > i ? 'bg-blush border-blush' : 'bg-transparent border-app-border'"
      />
    </div>

    <!-- Number pad -->
    <div
      v-if="tc.state === 'idle'"
      class="grid grid-cols-3 gap-2.5"
    >
      <button
        v-for="d in ['1','2','3','4','5','6','7','8','9']"
        :key="d"
        class="h-14.5 rounded-[10px] bg-cream text-charcoal font-semibold text-xl border border-app-border hover:bg-blush/10 active:scale-95 transition-all cursor-pointer touch-manipulation"
        @click="tc.appendDigit(d)"
      >
        {{ d }}
      </button>
      <div />
      <button
        class="h-14.5 rounded-[10px] bg-cream text-charcoal font-semibold text-xl border border-app-border hover:bg-blush/10 active:scale-95 transition-all cursor-pointer"
        @click="tc.appendDigit('0')"
      >
        0
      </button>
      <button
        class="h-14.5 rounded-[10px] bg-cream text-muted text-2xl border border-app-border hover:bg-blush/10 active:scale-95 transition-all cursor-pointer touch-manipulation"
        @click="tc.deleteDigit()"
      >
        ⌫
      </button>
    </div>

    <!-- Loading progress bar (replaces the pad while the PIN is looked up) -->
    <div
      v-else
      class="flex flex-col justify-center flex-1 gap-3"
    >
      <p class="text-[13px] text-muted text-center">
        Looking up PIN…
      </p>
      <div class="w-full h-0.75 bg-app-border rounded-full overflow-hidden">
        <div class="h-full bg-blush rounded-full tc-loading-bar" />
      </div>
    </div>
  </div>
</template>
