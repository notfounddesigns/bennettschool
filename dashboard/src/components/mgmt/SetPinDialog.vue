<script setup lang="ts">
import { ref } from 'vue'
import { setStudentPin } from '../../lib/api'
import { toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const app = useAppStore()
const pin = ref('')
const loading = ref(false)
const error = ref('')
const { req, open, close } = useDialog('setPin', () => {
  pin.value = ''
  error.value = ''
})

async function submit() {
  const r = req.value
  if (!r) return
  if (!/^\d{6}$/.test(pin.value)) {
    error.value = 'PIN must be exactly 6 digits (numbers only).'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await setStudentPin(r.id, pin.value)
    app.audit('pin_reset', { targetId: r.id, targetName: r.name, description: `Set PIN for ${toTitleCase(r.name)}` })
    close()
    app.showSnackbar(`PIN set for ${toTitleCase(r.name)}.`, 'success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to set PIN. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Set Timeclock PIN"
    width="380px"
    @close="close"
  >
    <div class="px-5.5 py-5">
      <p class="text-[13px] text-cream/70 mb-4">
        Set a 6-digit PIN for <span class="text-cream font-semibold">{{ req?.name }}</span> to use on the student timeclock.
      </p>
      <div
        v-if="error"
        class="alert-error"
      >
        {{ error }}
      </div>
      <label
        class="field-label"
        for="set-pin-input"
      >6-Digit PIN</label>
      <input
        id="set-pin-input"
        v-model="pin"
        type="text"
        inputmode="numeric"
        maxlength="6"
        placeholder="e.g. 123456"
        class="field-input pin-input"
        @keydown.enter="submit"
      >
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
          @click="submit"
        >
          <span
            v-if="loading"
            class="spinner"
          />
          <span>{{ loading ? 'Saving…' : 'Save PIN' }}</span>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
