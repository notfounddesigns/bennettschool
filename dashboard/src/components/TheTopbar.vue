<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '../lib/auth'
import { useAppStore } from '../stores/app'

defineProps<{ showSignOut?: boolean }>()

const app = useAppStore()
const router = useRouter()
const { logout } = useAuth()

function backToManagement() {
  app.exitImpersonation()
  router.push('/mgmt')
}
</script>

<template>
  <header class="flex w-full bg-topbar/70 px-8 h-14 z-99 items-center justify-between shrink-0 shadow-card">
    <img
      src="/nav-logo.png"
      class="h-14"
      alt="Bennett Cosmetology Logo"
    >
    <div class="flex items-center gap-3">
      <div
        v-if="showSignOut"
        class="flex items-center gap-3"
      >
        <button
          title="Sign Out"
          class="inline-flex items-center justify-center gap-1 text-stone-400 md:border md:border-stone-400 md:rounded-xl md:px-2 md:py-1 hover:border-stone-600 hover:text-stone-600 text-[12px] font-medium cursor-pointer bg-transparent transition-all"
          @click="logout"
        >
          <svg
            width="25px"
            height="25px"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          ><path
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M18 8L22 12M22 12L18 16M22 12H9M15 4.20404C13.7252 3.43827 12.2452 3 10.6667 3C5.8802 3 2 7.02944 2 12C2 16.9706 5.8802 21 10.6667 21C12.2452 21 13.7252 20.5617 15 19.796"
          /></svg>
          <span class="hidden md:block">Sign Out</span>
        </button>
        <span class="hidden md:block text-[13px] text-cream/80 font-medium">{{ app.displayName }}</span>
      </div>
      <div class="w-11 h-11 rounded-full bg-blush text-white flex items-center justify-center font-bold text-sm shrink-0">
        {{ app.avatarInitials }}
      </div>
    </div>
  </header>

  <!-- "View as student" banner -->
  <div
    v-if="app.isImpersonating"
    class="flex w-full items-center justify-between gap-3 bg-[#FEF3C7] text-[#92400E] px-8 py-2 text-[13px] font-medium shrink-0 border-b border-[#F5D98B] z-99"
  >
    <span class="flex items-center gap-2 min-w-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="shrink-0"
      ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
        cx="12"
        cy="12"
        r="3"
      /></svg>
      <span class="truncate">Viewing <strong>{{ app.displayName }}</strong>'s dashboard (read-only)</span>
    </span>
    <button
      class="inline-flex items-center gap-1 shrink-0 border border-[#92400E]/40 rounded-md px-2.5 py-1 cursor-pointer bg-transparent hover:bg-[#92400E]/10 transition-colors whitespace-nowrap"
      @click="backToManagement"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><line
        x1="19"
        y1="12"
        x2="5"
        y2="12"
      /><polyline points="12 19 5 12 12 5" /></svg>
      Back to management
    </button>
  </div>
</template>
