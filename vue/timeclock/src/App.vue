<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTimeclockStore } from './stores/timeclock'
import PinPad from './components/PinPad.vue'
import StudentCard from './components/StudentCard.vue'
import ActionButtons from './components/ActionButtons.vue'
import CountdownBar from './components/CountdownBar.vue'

const tc = useTimeclockStore()

onMounted(() => tc.initClock())
onUnmounted(() => tc.destroyClock())
</script>

<template>
  <div
    class="tc-bg flex flex-col items-center justify-center min-h-dvh font-sans select-none px-4"
    @keydown.window="tc.onKeydown($event)"
  >
    <img
      src="/nav-logo.png"
      class="h-14 mb-3"
      alt="Bennett Cosmetology"
    >

    <!-- Live clock -->
    <div class="text-center mb-7">
      <div class="font-serif text-4xl text-cream tabular-nums tracking-wide">
        {{ tc.currentTime }}
      </div>
      <div class="text-[13px] text-cream/45 mt-1 tracking-[0.04em]">
        {{ tc.currentDate }}
      </div>
    </div>

    <div class="bg-white rounded-card shadow-(--shadow-2xl) w-[clamp(300px,90vw,360px)] overflow-hidden">
      <!-- Header -->
      <div class="px-6 pt-5 pb-4 text-center border-b border-app-border">
        <div class="font-serif text-2xl text-app-bg">
          Student Timeclock
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-6 min-h-80 flex flex-col">
        <!-- IDLE / LOADING -->
        <PinPad v-if="tc.state === 'idle' || tc.state === 'loading'"/>

        <!-- ACTIONS -->
        <div
          v-else-if="tc.state === 'actions'"
          class="flex flex-col flex-1"
        >
          <!-- Inactivity banner -->
          <div
            v-if="tc.showingCountdown"
            class="mb-4 -mx-6 -mt-6 px-6 pt-3 pb-3 bg-blush-light/60"
          >
            <span class="text-[11px] font-semibold text-blush uppercase tracking-[0.07em]">
              Returning to PIN screen…
            </span>
          </div>

          <StudentCard />
          <ActionButtons />
        </div>

        <!-- SUCCESS -->
        <div
          v-else-if="tc.state === 'success'"
          class="flex flex-col flex-1 items-center justify-center text-center py-2"
        >
          <div class="w-16 h-16 rounded-full bg-sage/15 flex items-center justify-center mx-auto mb-4">
            <svg
              class="text-sage"
              xmlns="http://www.w3.org/2000/svg"
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p class="text-[16px] font-semibold text-charcoal">
            {{ tc.successMsg }}
          </p>
        </div>

        <!-- ERROR -->
        <div
          v-else-if="tc.state === 'error'"
          class="flex flex-col flex-1 items-center justify-center text-center py-2"
        >
          <div class="w-16 h-16 rounded-full bg-error-light flex items-center justify-center mx-auto mb-4">
            <svg
              class="text-app-error"
              xmlns="http://www.w3.org/2000/svg"
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line
                x1="18"
                y1="6"
                x2="6"
                y2="18"
              />
              <line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </div>
          <p class="text-[14px] font-semibold text-app-error">
            {{ tc.errorMsg }}
          </p>
        </div>
      </div>

      <!-- Countdown bar -->
      <CountdownBar />
    </div>
  </div>
</template>
