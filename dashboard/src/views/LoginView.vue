<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginEmployee } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAppStore } from '../stores/app'

const router = useRouter()
const app = useAppStore()
const { goHome } = useAuth()

const name = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  // Normalize iPad smart-quote apostrophes so names like "O'Neal" match.
  const n = name.value.trim().replace(/[‘’]/g, "'")
  const p = password.value
  if (!n) { error.value = 'Please enter your first and last name.'; return }
  if (!p) { error.value = 'Please enter your password.'; return }
  const parts = n.split(' ').filter(Boolean)
  if (parts.length < 2) { error.value = 'Please enter your first and last name.'; return }

  const [first, last] = parts
  loading.value = true
  try {
    const data = await loginEmployee(first, last, p)
    app.setEmployee(data.student)
    app.audit('login', {
      targetId: data.student.homebase_id,
      targetName: data.student.name,
      description: `${data.student.name} signed in`,
    })

    if (data.result === 'first_time') {
      await router.push('/setpass')
      return
    }
    await goHome()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error. Please try again.'
  } finally {
    password.value = ''
    loading.value = false
  }
}
</script>

<template>
  <main class="flex flex-col items-center justify-center min-h-dvh bg-app-bg bg-texture px-4">
    <div class="flex flex-col items-center w-[clamp(300px,90vw,500px)]">
      <img
        src="/nav-logo.png"
        class="h-28 mb-3"
        alt="Bennett Cosmetology"
      >

      <div class="bg-white rounded-[14px] px-10 py-5 shadow-[var(--shadow-lg)] w-full">
        <div class="font-serif text-2xl text-center text-charcoal mb-4">
          Student Portal
        </div>
        <p class="text-[13px] text-muted text-center mb-7 leading-relaxed">
          Sign in with your name and password.
        </p>

        <div
          v-if="error"
          class="px-[14px] py-[10px] rounded-[8px] text-[13px] mb-4 leading-relaxed bg-error-light text-app-error"
        >
          {{ error }}
        </div>

        <div class="mb-4">
          <label
            class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5"
            for="login-name"
          >
            First &amp; Last Name
          </label>
          <input
            id="login-name"
            v-model="name"
            type="text"
            placeholder="Jane Smith"
            class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none transition-colors focus:border-blush placeholder:text-muted"
            @keydown.enter="submit"
          >
        </div>

        <div class="mb-4">
          <label
            class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5"
            for="login-password"
          >
            Password
          </label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none transition-colors focus:border-blush placeholder:text-muted"
            @keydown.enter="submit"
          >
        </div>

        <button
          :disabled="loading"
          class="inline-flex items-center justify-center gap-2 w-full h-[50px] my-2 font-medium cursor-pointer rounded-[8px] transition-all bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed disabled:scale-100"
          @click="submit"
        >
          <span
            v-if="loading"
            class="spinner"
          />
          <span>{{ loading ? 'Please wait…' : 'Sign in' }}</span>
        </button>
      </div>
    </div>
  </main>
</template>
