<script setup lang="ts">
import { ref, computed } from 'vue'
import { clearStudentPassword } from '../../lib/api'
import { toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const app = useAppStore()
const loading = ref(false)
const { req, open, close } = useDialog('resetPassword')
const displayName = computed(() => toTitleCase(req.value?.name ?? ''))

async function confirm() {
  const r = req.value
  if (!r) return
  loading.value = true
  app.showLoading()
  try {
    await clearStudentPassword(r.id)
    app.audit('password_clear', { targetId: r.id, targetName: r.name, description: `Reset password for ${toTitleCase(r.name)}` })
    close()
    app.showSnackbar(`Password reset for ${toTitleCase(r.name)}.`, 'success')
  } catch {
    app.showSnackbar('Failed to reset password. Please try again.', 'error')
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Reset Password"
    @close="close"
  >
    <div class="px-5.5 py-5">
      <p class="text-[13px] text-cream">
        Reset password for <span class="font-semibold">{{ displayName }}</span> to the default?
      </p>
      <p class="text-[12px] text-muted mt-1.5">
        They will be prompted to set a new password on next login.
      </p>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <button
          class="btn-outline"
          @click="close"
        >
          Cancel
        </button>
        <button
          :disabled="loading"
          class="btn-primary"
          @click="confirm"
        >
          <span
            v-if="loading"
            class="spinner"
          />
          <span>{{ loading ? 'Resetting…' : 'Reset' }}</span>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
