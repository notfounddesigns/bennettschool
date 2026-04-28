<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'

const router = useRouter()
const app = useAppStore()

function logout() {
  app.clearEmployee()
  router.push('/login')
}
</script>

<template>
  <header class="flex w-full bg-topbar/70 px-8 h-14 z-99 items-center justify-between shrink-0 shadow-card">
    <img src="/nav-logo.png" class="h-14" alt="Bennett Cosmetology Logo" />
    <div class="flex items-center gap-3">
      <button
        @click="logout"
        class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-7 md:h-9.5 px-4.5 text-[15px] font-medium cursor-pointer bg-transparent transition-all hover:border-blush-hover hover:text-blush-hover"
      >
        Sign out
      </button>
      <span class="hidden md:block text-[13px] text-cream/80 font-medium">{{ app.displayName }}</span>
      <div class="w-11 h-11 rounded-full bg-blush text-white flex items-center justify-center font-bold text-sm shrink-0">
        {{ app.avatarInitials }}
      </div>
    </div>
  </header>
</template>
