<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useMgmtStore } from '../../stores/mgmt'
import type { OverviewStats } from '../../lib/api'

const mgmt = useMgmtStore()

const vals = reactive({ yH: 0, yS: 0, wH: 0, wS: 0, mH: 0, mS: 0 })

function animate(key: keyof typeof vals, target: number) {
  const from = vals[key]
  const t0 = performance.now()
  const tick = (now: number) => {
    const p = Math.min((now - t0) / 750, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    vals[key] = parseFloat((from + (target - from) * eased).toFixed(1))
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function apply(stats: OverviewStats | null) {
  if (!stats) return
  animate('yH', stats.yesterday.hours)
  animate('yS', stats.yesterday.students)
  animate('wH', stats.last7Days.hours)
  animate('wS', stats.last7Days.students)
  animate('mH', stats.mtd.hours)
  animate('mS', stats.mtd.students)
}

watch(() => mgmt.overviewStats, apply, { immediate: true })

function fmt(n: number): string {
  return n.toFixed(1)
}
</script>

<template>
  <div class="bg-white/8 border border-white/8 rounded-[14px] p-5">
    <p class="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-4">Time Punch Overview</p>
    <div class="grid grid-cols-3 divide-x divide-white/10">
      <div class="pr-5">
        <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-1.5">Yesterday</div>
        <div class="font-serif text-[28px] text-cream leading-none tabular-nums">
          {{ fmt(vals.yH) }}<span class="text-xs font-sans font-normal text-muted"> hrs</span>
        </div>
        <div class="text-[11px] text-muted mt-1">{{ Math.round(vals.yS) }} students</div>
      </div>
      <div class="px-5">
        <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-1.5">Last 7 Days</div>
        <div class="font-serif text-[28px] text-cream leading-none tabular-nums">
          {{ fmt(vals.wH) }}<span class="text-xs font-sans font-normal text-muted"> hrs</span>
        </div>
        <div class="text-[11px] text-muted mt-1">{{ Math.round(vals.wS) }} students</div>
      </div>
      <div class="pl-5">
        <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-1.5">Month to Date</div>
        <div class="font-serif text-[28px] text-cream leading-none tabular-nums">
          {{ fmt(vals.mH) }}<span class="text-xs font-sans font-normal text-muted"> hrs</span>
        </div>
        <div class="text-[11px] text-muted mt-1">{{ Math.round(vals.mS) }} students</div>
      </div>
    </div>
  </div>
</template>
