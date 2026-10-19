<template>
  <div class="shortcut-mask" @click.self="$emit('close')">
    <div class="shortcut-panel">
      <div class="shortcut-head">
        <h3>键盘快捷键</h3>
        <el-button link @click="$emit('close')">关闭 Esc</el-button>
      </div>
      <p class="muted" style="margin:0">这套系统为键盘操作优化，答题时可以全程不碰鼠标。</p>

      <template v-for="group in groups" :key="group.label">
        <div class="shortcut-group">{{ group.label }}</div>
        <div v-for="row in group.rows" :key="row.label" class="shortcut-row">
          <span>{{ row.label }}</span>
          <span class="shortcut-keys">
            <template v-for="(k, i) in row.keys" :key="k">
              <span v-if="i > 0" class="muted" style="font-size:11px">/</span>
              <kbd>{{ k }}</kbd>
            </template>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
defineEmits(['close'])

const groups = [
  {
    label: '答题',
    rows: [
      { label: '选择选项', keys: ['1', '2', '3', '4'] },
      { label: '选择选项（字母键）', keys: ['A', 'B', 'C', 'D'] },
      { label: '提交 / 下一题', keys: ['Enter'] },
      { label: '上一题', keys: ['Backspace'] },
      { label: '退出关卡', keys: ['Esc'] }
    ]
  },
  {
    label: '通用',
    rows: [
      { label: '打开 / 关闭本面板', keys: ['Shift', '?'] },
      { label: '关闭弹窗', keys: ['Esc'] }
    ]
  }
]
</script>
