<script setup lang="ts">
import { ref, watch } from 'vue'
import { changeStudentPin, setStudentPin, studentHasPin } from '../lib/api'
import { useAppStore } from '../stores/app'
import AppDialog from './AppDialog.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useAppStore()

const hasPin = ref(true) // true → "change" flow (needs current PIN); false → first-time "create"
const checking = ref(true)
const currentPin = ref('')
const newPin = ref('')
const confirmPin = ref('')
const loading = ref(false)
const error = ref('')

watch(() => props.open, async open => {
  if (!open) return
  currentPin.value = ''
  newPin.value = ''
  confirmPin.value = ''
  error.value = ''
  checking.value = true
  hasPin.value = true
  const emp = app.currentEmployee
  if (!emp) { checking.value = false; return }
  try {
    hasPin.value = await studentHasPin(emp.homebase_id)
  } catch {
    // Assume they have one; the server still validates the current PIN.
    hasPin.value = true
  } finally {
    checking.value = false
  }
})

const SIX_DIGITS = /^\d{6}$/

async function submit() {
  if ((hasPin.value && !SIX_DIGITS.test(currentPin.value)) || !SIX_DIGITS.test(newPin.value)) {
    error.value = 'PINs must be exactly 6 digits (numbers only).'
    return
  }
  if (newPin.value !== confirmPin.value) {
    error.value = 'New PIN and confirmation do not match.'
    return
  }
  const emp = app.currentEmployee
  if (!emp) return

  loading.value = true
  error.value = ''
  try {
    if (hasPin.value) await changeStudentPin(emp.homebase_id, currentPin.value, newPin.value)
    else await setStudentPin(emp.homebase_id, newPin.value)
    app.audit('pin_reset', {
      targetId: emp.homebase_id,
      targetName: emp.name,
      description: `${emp.name} ${hasPin.value ? 'changed' : 'created'} their timeclock PIN`,
    })
    emit('close')
    app.showSnackbar(hasPin.value ? 'Your PIN has been updated.' : 'Your PIN has been created.', 'success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save PIN. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="hasPin ? 'Change Timeclock PIN' : 'Create Timeclock PIN'"
    width="380px"
    @close="emit('close')"
  >
    <div
      class="px-5.5 py-5"
      @keydown.enter="submit"
    >
      <p class="text-[13px] text-cream/70 mb-4">
        {{ hasPin
          ? 'Update the 6-digit PIN you use to clock in and out on the student timeclock.'
          : 'Create a 6-digit PIN to clock in and out on the student timeclock.' }}
      </p>
      <div
        v-if="error"
        class="alert-error"
      >
        {{ error }}
      </div>
      <div v-if="!checking && hasPin">
        <label
          class="field-label"
          for="change-pin-current"
        >Current PIN</label>
        <input
          id="change-pin-current"
          v-model="currentPin"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="e.g. 123456"
          class="field-input pin-input mb-3.5"
        >
      </div>
      <label
        class="field-label"
        for="change-pin-new"
      >New PIN</label>
      <input
        id="change-pin-new"
        v-model="newPin"
        type="text"
        inputmode="numeric"
        maxlength="6"
        placeholder="e.g. 246810"
        class="field-input pin-input mb-3.5"
      >
      <label
        class="field-label"
        for="change-pin-confirm"
      >Confirm New PIN</label>
      <input
        id="change-pin-confirm"
        v-model="confirmPin"
        type="text"
        inputmode="numeric"
        maxlength="6"
        placeholder="e.g. 246810"
        class="field-input pin-input"
      >
    </div>
    <template #footer>
      <div class="dialog-footer">
        <button
          class="btn-outline"
          @click="emit('close')"
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
