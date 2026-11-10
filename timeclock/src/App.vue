<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useTimeclockStore } from './stores/timeclock'
import UnlockForm from './components/UnlockForm.vue'
import PinPad from './components/PinPad.vue'
import StudentCard from './components/StudentCard.vue'
import ActionButtons from './components/ActionButtons.vue'
import CountdownBar from './components/CountdownBar.vue'

const tc = useTimeclockStore()

// Hidden capture rig for front-facing camera punch photos. Always mounted so
// the camera can stay warm while the kiosk is unlocked.
const punchVideo = ref<HTMLVideoElement | null>(null)
const punchCanvas = ref<HTMLCanvasElement | null>(null)

const onKeydown = (e: KeyboardEvent) => tc.onKeydown(e)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  tc.init(punchVideo.value, punchCanvas.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  tc.destroy()
})
</script>

<template>
  <div class="tc-bg flex flex-col items-center justify-center min-h-dvh font-sans select-none touch-manipulation px-4">
    <video
      ref="punchVideo"
      autoplay
      playsinline
      muted
      class="hidden"
      width="320"
      height="240"
    />
    <canvas
      ref="punchCanvas"
      class="hidden"
      width="320"
      height="240"
    />

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

    <!-- LOCKED: manager unlock -->
    <UnlockForm v-if="tc.locked" />

    <!-- UNLOCKED: student timeclock -->
    <div
      v-else
      class="bg-white rounded-card shadow-(--shadow-2xl) w-[clamp(300px,90vw,360px)] overflow-hidden"
    >
      <!-- Header -->
      <div class="px-6 pt-5 pb-4 text-center border-b border-app-border">
        <div class="font-serif text-2xl text-app-bg">
          Student Timeclock
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-6 min-h-80 flex flex-col">
        <!-- IDLE / LOADING -->
        <PinPad v-if="tc.state === 'idle' || tc.state === 'loading'" />

        <!-- ACTIONS -->
        <div
          v-else-if="tc.state === 'actions'"
          class="flex flex-col flex-1"
        >
          <!-- Inactivity warning banner — appears after 7s of no interaction -->
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

      <!-- Global countdown bar -->
      <CountdownBar />
    </div>

    <!-- Lock kiosk — only while unlocked -->
    <button
      v-if="!tc.locked"
      class="mt-5 inline-flex items-center gap-1.5 text-[12px] text-cream/50 hover:text-cream/80 transition-colors cursor-pointer"
      @click="tc.lock()"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect
          x="3"
          y="11"
          width="18"
          height="11"
          rx="2"
          ry="2"
        />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Lock kiosk<span v-if="tc.manager">{{ ' · ' + tc.manager.name }}</span></span>
    </button>
  </div>
</template>
