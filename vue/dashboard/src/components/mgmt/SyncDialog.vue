<script setup lang="ts">
import { ref, watch } from 'vue'
import { syncHoursByDate } from '../../lib/api'
import { useAppStore } from '../../stores/app'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; synced: [] }>()

const app = useAppStore()
const dialogEl = ref<HTMLDialogElement>()
const date = ref('')
const loading = ref(false)

watch(() => props.open, (val) => {
  if (val) { date.value = ''; dialogEl.value?.showModal() }
  else dialogEl.value?.close()
})

function close() { emit('update:open', false) }

async function sync() {
  if (!date.value) { app.showSnackbar('Please select a date before syncing.', 'error'); return }
  loading.value = true
  app.showLoading()
  try {
    const emp = app.currentEmployee!
    const synced_by = `${emp.first_name} ${emp.last_name}`
    const { inserted } = await syncHoursByDate(date.value, synced_by)
    close()
    app.showSnackbar(`Success — ${inserted} timecards synced.`, 'success')
    setTimeout(() => emit('synced'), 3500)
  } catch {
    app.showSnackbar('Error syncing hours. Please try again.', 'error')
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal border-none rounded-[14px] shadow-[var(--shadow-lg)] p-0 w-[clamp(300px,92vw,480px)] max-h-[90vh] overflow-y-auto bg-modal-bg m-auto"
    @cancel.prevent="close"
  >
    <div class="flex items-center justify-between px-[22px] py-[18px] border-b border-app-border">
      <span class="font-serif text-lg text-cream">Select Date</span>
    </div>
    <div class="px-[22px] py-5">
      <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Date</label>
      <input v-model="date" type="date" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none" />
    </div>
    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="sync" :disabled="loading" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">
        <span v-if="loading" class="spinner" />
        {{ loading ? 'Syncing…' : 'Sync' }}
      </button>
    </div>
  </dialog>
</template>
