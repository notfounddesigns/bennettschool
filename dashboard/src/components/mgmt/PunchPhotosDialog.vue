<script setup lang="ts">
import { ref } from 'vue'
import { fetchPunchPhotos, getPunchPhotoUrl } from '../../lib/api'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const loading = ref(false)
const photos = ref<Array<{ label: string; url: string }>>([])
let requestSeq = 0

const { open, close } = useDialog('punchPhotos', async r => {
  const seq = ++requestSeq
  loading.value = true
  photos.value = []
  try {
    const data = await fetchPunchPhotos(r.homebaseId, r.clockIn)
    const items: Array<{ label: string; path: string | null }> = []
    if (data) {
      items.push({ label: 'Clock In', path: data.clock_in_photo_path })
      items.push({ label: 'Clock Out', path: data.clock_out_photo_path })
      data.timeclock_breaks.forEach((b, i) => {
        const n = data.timeclock_breaks.length > 1 ? ` ${i + 1}` : ''
        items.push({ label: `Break${n} Start`, path: b.break_start_photo_path })
        items.push({ label: `Break${n} End`, path: b.break_end_photo_path })
      })
    }
    const resolved = await Promise.all(
      items
        .filter((item): item is { label: string; path: string } => !!item.path)
        .map(async item => ({ label: item.label, url: await getPunchPhotoUrl(item.path) })),
    )
    // Ignore a slow response for a dialog that has since been reopened.
    if (seq === requestSeq) photos.value = resolved.filter((p): p is { label: string; url: string } => !!p.url)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
})
</script>

<template>
  <AppDialog
    :open="open"
    title="Punch Photos"
    width="520px"
    scroll
    close-button
    @close="close"
  >
    <div class="px-5.5 py-5">
      <div
        v-if="loading"
        class="flex items-center justify-center py-10"
      >
        <span class="spinner" />
      </div>
      <div
        v-else-if="photos.length === 0"
        class="text-center py-10 text-[13px] text-muted"
      >
        No photos were captured for this punch.
      </div>
      <div
        v-else
        class="grid grid-cols-2 gap-4"
      >
        <div
          v-for="photo in photos"
          :key="photo.label"
          class="flex flex-col gap-1.5"
        >
          <span class="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{{ photo.label }}</span>
          <a
            :href="photo.url"
            target="_blank"
            rel="noopener"
          >
            <img
              :src="photo.url"
              :alt="photo.label"
              class="w-full aspect-4/3 object-cover rounded-[8px] border border-app-border bg-cream"
            >
          </a>
        </div>
      </div>
    </div>
  </AppDialog>
</template>
