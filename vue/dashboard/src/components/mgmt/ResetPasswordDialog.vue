<script setup lang="ts">
import { ref, watch } from 'vue'
import { setEmployeePassword } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import { toTitleCase } from '../../lib/helpers'

const props = defineProps<{
  open: boolean
  target: { id: number; name: string } | null
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const app = useAppStore()
const dialogEl = ref<HTMLDialogElement>()
const loading = ref(false)

watch(() => props.open, (val) => {
  if (val) dialogEl.value?.showModal()
  else dialogEl.value?.close()
})

function close() { emit('update:open', false) }

async function confirm() {
  if (!props.target) return
  loading.value = true
  app.showLoading()
  try {
    await setEmployeePassword(props.target.id, props.target.name, 'Welcome123')
    close()
    app.showSnackbar(`Password reset for ${toTitleCase(props.target.name)}.`, 'success')
  } catch {
    app.showSnackbar('Failed to reset password. Please try again.', 'error')
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal border-none rounded-[14px] shadow-[var(--shadow-lg)] p-0 w-[clamp(300px,92vw,420px)] bg-modal-bg m-auto"
    @cancel.prevent="close"
  >
    <div class="px-[22px] py-[18px] border-b border-app-border">
      <span class="font-serif text-lg text-cream">Reset Password</span>
    </div>
    <div class="px-[22px] py-5">
      <p class="text-[13px] text-cream">
        Reset password for <span class="font-semibold">{{ target ? toTitleCase(target.name) : '' }}</span> to the default?
      </p>
      <p class="text-[12px] text-muted mt-1.5">They will be prompted to set a new password on next login.</p>
    </div>
    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="confirm" :disabled="loading" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">
        <span v-if="loading" class="spinner" />
        {{ loading ? 'Resetting…' : 'Reset' }}
      </button>
    </div>
  </dialog>
</template>
