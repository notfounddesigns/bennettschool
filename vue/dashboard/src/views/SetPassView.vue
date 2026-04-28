<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { setEmployeePassword } from '../lib/api'
import { useAppStore } from '../stores/app'
import { useDashboardStore } from '../stores/dashboard'
import { useMgmtStore } from '../stores/mgmt'

const router = useRouter()
const app = useAppStore()
const dashboardStore = useDashboardStore()
const mgmtStore = useMgmtStore()

const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  success.value = ''
  const np = newPassword.value
  const cp = confirmPassword.value
  if (np.length < 8) { error.value = 'Password must be at least 8 characters.'; return }
  if (np !== cp) { error.value = 'Passwords do not match.'; return }

  const emp = app.currentEmployee
  if (!emp) { error.value = 'Session expired. Please sign in again.'; router.push('/login'); return }

  loading.value = true
  try {
    const fullName = `${emp.first_name} ${emp.last_name}`
    await setEmployeePassword(emp.id, fullName, np)
    success.value = 'Password saved! Taking you to your dashboard…'

    setTimeout(async () => {
      if (app.isManager) {
        await mgmtStore.load()
        router.push('/mgmt')
      } else {
        await dashboardStore.load(emp.id)
        router.push('/dashboard')
      }
    }, 1200)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error. Please try again.'
  } finally {
    newPassword.value = ''
    confirmPassword.value = ''
    loading.value = false
  }
}
</script>

<template>
  <main class="flex flex-col items-center justify-center min-h-dvh bg-app-bg bg-texture px-4">
    <div class="flex flex-col items-center w-[clamp(300px,90vw,500px)]">
      <img src="/nav-logo.png" class="h-28 mb-3" alt="Bennett Cosmetology" />

      <div class="bg-white rounded-[14px] px-10 py-5 shadow-[var(--shadow-lg)] w-full">
        <div class="font-serif text-2xl text-center text-charcoal mb-4">Student Portal</div>
        <p class="text-[13px] text-muted text-center mb-7 leading-relaxed">
          Create a new password. Minimum of 8 characters.
        </p>

        <div
          v-if="error"
          class="px-[14px] py-[10px] rounded-[8px] text-[13px] mb-4 leading-relaxed bg-error-light text-app-error"
        >
          {{ error }}
        </div>

        <div
          v-if="success"
          class="px-[14px] py-[10px] rounded-[8px] text-[13px] mb-4 leading-relaxed bg-sage-light text-[#2D6A55] border border-[#B0D8C8]"
        >
          {{ success }}
        </div>

        <div class="mb-4">
          <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5" for="setpass-new">
            New password
          </label>
          <input
            id="setpass-new"
            v-model="newPassword"
            type="password"
            placeholder="Min 8 characters"
            autocomplete="new-password"
            class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none transition-colors focus:border-blush placeholder:text-muted"
          />
        </div>

        <div class="mb-4">
          <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5" for="setpass-confirm">
            Confirm password
          </label>
          <input
            id="setpass-confirm"
            v-model="confirmPassword"
            type="password"
            placeholder="Re-enter password"
            autocomplete="new-password"
            @keydown.enter="submit"
            class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none transition-colors focus:border-blush placeholder:text-muted"
          />
        </div>

        <button
          :disabled="loading"
          @click="submit"
          class="inline-flex items-center justify-center gap-2 w-full h-[50px] my-2 font-medium cursor-pointer rounded-[8px] transition-all bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span v-if="loading" class="spinner" />
          <span>{{ loading ? 'Please wait…' : 'Set password &amp; continue' }}</span>
        </button>
      </div>
    </div>
  </main>
</template>
