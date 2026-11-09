<template>
  <!--
    最后一关通关的庆祝弹窗。
    为什么要弹窗而不是只留页面里的那行字：那行文案在错题回顾下面，
    学生看完分数就往下滚走了，等于没看见；弹窗是「抬头就在眼前」。

    只在**最后一关**出现 —— 中间关有「下一关」，节奏应该是往前的，
    不适合打断；全部打完才是真正的收尾，值得停一下。
  -->
  <el-dialog
    v-model="visible"
    width="460px"
    align-center
    append-to-body
    :show-close="true"
    :close-on-click-modal="false"
    destroy-on-close
    class="celebrate-dialog"
  >
    <div class="celebrate">
      <div class="confetti" aria-hidden="true">
        <i v-for="n in 16" :key="n" :style="confettiStyle(n)"></i>
      </div>

      <div class="celebrate-emoji">🏆</div>
      <div class="celebrate-title">Congratulations！</div>
      <div class="celebrate-en">You cleared the level.</div>
      <div class="celebrate-sub">
        你已通关全部 <b>{{ levelCount }}</b> 个{{ kind }}关卡
      </div>

      <div class="celebrate-actions">
        <el-button class="btn-primary" @click="close('back')">返回关卡</el-button>
        <el-button class="btn-ghost" @click="close('retry')">再来一次</el-button>
      </div>

      <!--
        右上角的 × 是唯一「只收弹窗、不切页」的出口：
        下面两个按钮都会 emit 出去跳路由，弹窗一关学生就被带走，
        最后一关的错题回顾（就在成绩页下方）再也看不到了。
      -->
      <div class="celebrate-tip">点右上角 × 关闭，可留在本页继续看错题回顾</div>
    </div>
  </el-dialog>
</template>

<script setup>
defineProps({
  /** 模块名，用于「全部 N 个XX关卡」这句 */
  kind: { type: String, default: '词汇' },
  levelCount: { type: Number, default: 0 }
})

const emit = defineEmits(['back', 'retry'])

const visible = defineModel({ type: Boolean, default: false })

/** 按钮点完先把弹窗收掉再切页，否则跳走那一刻弹窗还悬在旧页面上 */
function close(action) {
  visible.value = false
  emit(action)
}

const CONFETTI_COLORS = ['#4f46e5', '#6366f1', '#a16207', '#15803d', '#b91c1c']

/**
 * 纸屑位置按序号算出来，不用随机数 ——
 * 随机数每次渲染都变，弹窗一抖动纸屑就整体乱跳。
 */
function confettiStyle(n) {
  const size = 5 + (n % 3) * 2
  return {
    left: `${(n * 37) % 96}%`,
    width: `${size}px`,
    height: `${size * 1.8}px`,
    background: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
    animationDelay: `${(n % 8) * 0.09}s`,
    animationDuration: `${1.5 + (n % 5) * 0.22}s`
  }
}
</script>

<style scoped>
.celebrate {
  position: relative;
  padding: 6px 4px 2px;
  text-align: center;
  overflow: hidden;
}

.celebrate-emoji {
  font-size: 46px;
  line-height: 1.2;
  animation: celebrate-pop 0.45s cubic-bezier(0.22, 1.2, 0.36, 1) both;
}

.celebrate-title {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.2px;
  background: var(--eq-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.celebrate-en {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--eq-text);
}

.celebrate-sub {
  margin-top: 10px;
  font-size: 13px;
  color: var(--eq-text-sub);
}
.celebrate-sub b {
  color: var(--eq-accent);
  font-weight: 600;
}

.celebrate-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.celebrate-tip {
  margin-top: 10px;
  font-size: 12px;
  color: var(--eq-text-sub);
  opacity: 0.85;
}

/* ---------- 纸屑：一次性洒落，不做循环 ---------- */
.confetti {
  position: absolute;
  inset: -18px 0 auto;
  height: 0;
  pointer-events: none;
}
.confetti i {
  position: absolute;
  top: 0;
  border-radius: 1px;
  opacity: 0;
  animation-name: confetti-fall;
  animation-timing-function: cubic-bezier(0.3, 0.7, 0.4, 1);
  animation-fill-mode: forwards;
}

@keyframes confetti-fall {
  0% {
    opacity: 0;
    transform: translateY(-10px) rotate(0deg);
  }
  15% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
    transform: translateY(190px) rotate(320deg);
  }
}

@keyframes celebrate-pop {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 无障碍：跟随系统「减少动态效果」时，纸屑与入场动画一律不做 */
@media (prefers-reduced-motion: reduce) {
  .confetti,
  .celebrate-emoji {
    animation: none;
  }
}
</style>

<style>
/* Element Plus 弹窗的外壳在组件作用域之外，只能这样改 */
.celebrate-dialog.el-dialog {
  padding: 26px 24px 22px;
  border-radius: var(--eq-radius);
}

/*
 * 标题区压成 0 高，但**不能 display:none** ——
 * 右上角的 × 就长在这个容器里，整块藏掉会连关闭按钮一起消失，
 * 而 × 恰恰是这个弹窗唯一「只收弹窗、不跳页」的出口。
 * 压成 0 高之后，绝对定位的 × 仍然浮在卡片右上角。
 */
.celebrate-dialog .el-dialog__header {
  height: 0;
  padding: 0;
  margin: 0;
}

/* × 收进卡片内边距里，别贴着圆角 */
.celebrate-dialog .el-dialog__headerbtn {
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: background var(--eq-dur) var(--eq-ease);
}
.celebrate-dialog .el-dialog__headerbtn:hover {
  background: var(--eq-surface-sunken);
}
.celebrate-dialog .el-dialog__headerbtn .el-dialog__close {
  font-size: 17px;
  color: var(--eq-text-sub);
}
.celebrate-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--eq-text);
}

.celebrate-dialog .el-dialog__body {
  padding: 0;
}
</style>
