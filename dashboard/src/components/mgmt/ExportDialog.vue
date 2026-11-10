<script setup lang="ts">
import { ref } from 'vue'
import { exportStudents } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const app = useAppStore()
const monthYear = ref('') // 'YYYY-MM'
const { open, close } = useDialog('export', () => {
  monthYear.value = new Date().toISOString().slice(0, 7)
})

async function submit() {
  if (!monthYear.value) return
  const [year, month] = monthYear.value.split('-').map(Number)
  const now = new Date()
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
    app.showSnackbar('Cannot export a future month.', 'error', 3500)
    return
  }
  const fileMonth = monthYear.value
  close()
  app.showLoading()
  try {
    const blob = await exportStudents(month, year)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bennett_${fileMonth}.xlsx`
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
  <AppDialog
    :open="open"
    title="Export Attendance"
    @close="close"
  >
    <div class="px-5.5 py-5">
      <label
        class="field-label"
        for="export-month"
      >Month</label>
      <input
        id="export-month"
        v-model="monthYear"
        type="month"
        class="field-input"
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
          :disabled="!monthYear"
          class="btn-primary"
          @click="submit"
        >
          Export
        </button>
      </div>
    </template>
  </AppDialog>
</template>
