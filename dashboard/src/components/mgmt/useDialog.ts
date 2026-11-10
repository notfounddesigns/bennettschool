import { computed, watch } from 'vue'
import { useMgmtStore, type DialogRequest } from '../../stores/mgmt.ts'

type Req<K extends DialogRequest['kind']> = Extract<DialogRequest, { kind: K }>

// Binds a dialog component to one or more kinds of the store's `dialog` slot.
// `onOpen` runs each time a matching request arrives.
export function useDialog<K extends DialogRequest['kind']>(kinds: K | K[], onOpen?: (req: Req<K>) => void) {
  const mgmt = useMgmtStore()
  const list = (Array.isArray(kinds) ? kinds : [kinds]) as DialogRequest['kind'][]

  const req = computed(() => {
    const d = mgmt.dialog
    return d && list.includes(d.kind) ? (d as Req<K>) : null
  })
  const open = computed(() => req.value !== null)

  if (onOpen) watch(req, r => { if (r) onOpen(r) })

  function close() {
    if (req.value) mgmt.closeDialog()
  }

  return { req, open, close, mgmt }
}
