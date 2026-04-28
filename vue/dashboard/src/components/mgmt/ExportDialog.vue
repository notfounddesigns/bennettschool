<script setup lang="ts">
import { ref, watch } from 'vue'
import { exportStudents } from '../../lib/api'
import { useAppStore } from '../../stores/app'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const app = useAppStore()
const dialogEl = ref<HTMLDialogElement>()
const monthYear = ref(new Date().toISOString().slice(0, 7))

watch(() => props.open, (val) => {
  if (val) { monthYear.value = new Date().toISOString().slice(0, 7); dialogEl.value?.showModal() }
  else dialogEl.value?.close()
})

function close() { emit('update:open', false) }

async function submit() {
  if (!monthYear.value) return
  const [year, month] = monthYear.value.split('-').map(Number)
  const now = new Date()
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
    app.showSnackbar('Cannot export a future month.', 'error', 3500)
    return
  }
  close()
  app.showLoading()
  try {
    const blob = await exportStudents(month, year)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bennett_${monthYear.value}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    app.showSnackbar('Export failed. Please try again.', 'error')
  } finally {
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
    <div class="px-[22px] py-4.5 border-b border-app-border">
      <span class="font-serif text-lg text-cream">Export Attendance</span>
    </div>
    <div class="px-[22px] py-5">
      <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Month</label>
      <input v-model="monthYear" type="month" class="w-full px-3.5 py-2.5 border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none" />
    </div>
    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="submit" :disabled="!monthYear" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">Export</button>
    </div>
  </dialog>
</template>
