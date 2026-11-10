<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  width?: string
  scroll?: boolean
  closeButton?: boolean
}>(), {
  title: '',
  width: '420px',
  scroll: false,
  closeButton: false,
})

const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement | null>(null)

function sync(open: boolean) {
  const d = el.value
  if (!d) return
  if (open && !d.open) d.showModal()
  else if (!open && d.open) d.close()
}

watch(() => props.open, sync)
onMounted(() => sync(props.open))
</script>

<template>
  <dialog
    ref="el"
    class="modal border-none rounded-card shadow-(--shadow-lg) p-0 bg-modal-bg m-auto"
    :class="scroll && 'max-h-[90vh] overflow-y-auto'"
    :style="{ width: `clamp(300px, 92vw, ${width})` }"
    @close="emit('close')"
  >
    <div
      class="px-5.5 py-4.5 border-b border-app-border"
      :class="closeButton && 'flex items-center justify-between'"
    >
      <slot name="title">
        <span class="font-serif text-lg text-cream">{{ title }}</span>
      </slot>
      <button
        v-if="closeButton"
        aria-label="Close"
        class="bg-transparent border-none text-[22px] text-cream cursor-pointer leading-none px-1 transition-colors hover:text-charcoal"
        @click="emit('close')"
      >
        &times;
      </button>
    </div>
    <slot />
    <slot name="footer" />
  </dialog>
</template>
