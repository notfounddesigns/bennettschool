<script setup lang="ts">
import { useTimeclockStore } from '../stores/timeclock'
const tc = useTimeclockStore()
</script>

<template>
  <div class="bg-white rounded-card shadow-(--shadow-2xl) w-[clamp(300px,90vw,360px)] overflow-hidden">
    <div class="px-6 pt-5 pb-4 text-center border-b border-app-border">
      <div class="font-serif text-2xl text-app-bg">
        Kiosk Locked
      </div>
      <p class="text-[13px] text-muted mt-1">
        A manager must sign in to enable this device.
      </p>
    </div>

    <form
      class="px-6 py-6 flex flex-col gap-3"
      @submit.prevent="tc.unlock()"
    >
      <div>
        <label
          for="kiosk-login-name"
          class="block text-[12px] font-medium text-muted mb-1"
        >Manager name</label>
        <input
          id="kiosk-login-name"
          v-model="tc.loginName"
          type="text"
          :disabled="tc.unlocking"
          autocomplete="off"
          placeholder="First and last name"
          class="w-full h-11 px-3 rounded-[10px] bg-cream text-charcoal border border-app-border text-[15px] outline-none focus:border-blush transition-colors disabled:opacity-50"
        >
      </div>
      <div>
        <label
          for="kiosk-login-password"
          class="block text-[12px] font-medium text-muted mb-1"
        >Password</label>
        <input
          id="kiosk-login-password"
          v-model="tc.loginPassword"
          type="password"
          :disabled="tc.unlocking"
          autocomplete="off"
          placeholder="Password"
          class="w-full h-11 px-3 rounded-[10px] bg-cream text-charcoal border border-app-border text-[15px] outline-none focus:border-blush transition-colors disabled:opacity-50"
        >
      </div>

      <p
        v-if="tc.loginError"
        class="text-[13px] text-app-error font-medium"
      >
        {{ tc.loginError }}
      </p>

      <button
        type="submit"
        :disabled="tc.unlocking"
        class="w-full h-12 rounded-[10px] bg-blush text-white font-semibold text-[15px] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 touch-manipulation"
      >
        <span
          v-if="tc.unlocking"
          class="inline-flex items-center gap-2"
        >
          <span class="spinner" />Signing in…
        </span>
        <span v-else>Unlock Kiosk</span>
      </button>
    </form>
  </div>
</template>
