<script setup lang="ts">
import { ref, watch } from 'vue'
import { setStudentPin } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import { toTitleCase } from '../../lib/helpers'

const props = defineProps<{
  open: boolean
  target: { id: number; name: string } | null
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const app = useAppStore()
const dialogEl = ref<HTMLDialogElement>()
const pin = ref('')
const loading = ref(false)
const error = ref('')

watch(() => props.open, (val) => {
  if (val) { pin.value = ''; error.value = ''; dialogEl.value?.showModal() }
  else dialogEl.value?.close()
})

function close() { emit('update:open', false) }

async function submit() {
  if (!/^\d{4}$/.test(pin.value)) {
    error.value = 'PIN must be exactly 4 digits (numbers only).'
    return
  }
  if (!props.target) return
  loading.value = true
  error.value = ''
  try {
    await setStudentPin(props.target.id, pin.value)
    close()
    app.showSnackbar(`PIN set for ${toTitleCase(props.target.name)}.`, 'success')
  } catch {
    error.value = 'Failed to set PIN. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal border-none rounded-[14px] shadow-[var(--shadow-lg)] p-0 w-[clamp(300px,92vw,380px)] bg-modal-bg m-auto"
    @cancel.prevent="close"
  >
    <div class="px-[22px] py-4.5 border-b border-app-border">
      <span class="font-serif text-lg text-cream">Set Timeclock PIN</span>
    </div>
    <div class="px-[22px] py-5">
      <p class="text-[13px] text-cream/70 mb-4">
        Set a 4-digit PIN for <span class="text-cream font-semibold">{{ target ? toTitleCase(target.name) : '' }}</span> to use on the student timeclock.
      </p>
      <div v-if="error" class="px-[14px] py-[10px] rounded-[8px] text-[13px] mb-4 leading-relaxed bg-error-light text-app-error">{{ error }}</div>
      <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">4-Digit PIN</label>
      <input
        v-model="pin"
        type="text"
        inputmode="numeric"
        maxlength="4"
        placeholder="e.g. 1234"
        @keydown.enter="submit"
        @keydown.escape="close"
        class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush placeholder:text-muted tracking-[0.2em] text-lg"
      />
    </div>
    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="submit" :disabled="loading" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">
        <span v-if="loading" class="spinner" />
        {{ loading ? 'Saving…' : 'Save PIN' }}
      </button>
    </div>
  </dialog>
</template>
