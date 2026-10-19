<template>
  <div class="keybar">
    <div v-for="(h, i) in hints" :key="i" class="keybar-hint">
      <kbd v-for="k in toArray(h.keys)" :key="k">{{ keyLabel(k) }}</kbd>
      <span class="keybar-tip">{{ h.label }}</span>
    </div>

    <div class="keybar-right">
      <div class="keybar-hint">
        <!-- 「?」本身就要按 Shift 才打得出来，只写 ? 会让人以为有一个单独的问号键 -->
        <kbd>Shift</kbd><kbd>?</kbd>
        <span class="keybar-tip">全部快捷键</span>
      </div>
      <span v-if="status" class="keybar-status">{{ status }}</span>
    </div>
  </div>
</template>

<script setup>
import { useKeyHints } from '@/composables/useKeyHints'

const { hints, status } = useKeyHints()

function toArray(keys) {
  return Array.isArray(keys) ? keys : [keys]
}

const LABELS = {
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

function keyLabel(k) {
  if (LABELS[k]) return LABELS[k]
  return k.length === 1 ? k.toUpperCase() : k
}
</script>
