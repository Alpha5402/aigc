<template>
  <canvas
    v-if="canvasReady"
    class="farm-pattern-canvas"
    :canvas-id="canvasId"
    :id="canvasId"
    aria-hidden="true"
  ></canvas>
  <view v-else class="farm-pattern-fallback"></view>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    canvasId?: string
    variant?: 'hero' | 'plot'
  }>(),
  {
    canvasId: 'farm-pattern-canvas',
    variant: 'hero',
  },
)

const canvasReady = ref(true)
let redrawTimer: ReturnType<typeof setTimeout> | null = null

const drawHero = (ctx: UniApp.CanvasContext) => {
  ctx.clearRect(0, 0, 375, 220)

  ctx.setFillStyle('rgba(255, 254, 247, 0.04)')
  ctx.fillRect(0, 0, 375, 220)

  const ridgeColors = ['rgba(255, 244, 215, 0.34)', 'rgba(232, 244, 232, 0.24)', 'rgba(122, 101, 72, 0.18)']
  for (let i = 0; i < 11; i += 1) {
    ctx.beginPath()
    ctx.setStrokeStyle(ridgeColors[i % ridgeColors.length])
    ctx.setLineWidth(i % 3 === 0 ? 1.5 : 0.8)
    const y = 34 + i * 19
    ctx.moveTo(-20, y)
    ctx.bezierCurveTo(64, y - 20 - i, 138, y + 21, 226, y - 5)
    ctx.bezierCurveTo(294, y - 25, 338, y + 12, 402, y - 10)
    ctx.stroke()
  }

  const plots = [
    { x: 32, y: 96, w: 90, h: 44, color: 'rgba(78, 154, 97, 0.18)' },
    { x: 156, y: 76, w: 112, h: 52, color: 'rgba(214, 168, 58, 0.13)' },
    { x: 236, y: 136, w: 108, h: 46, color: 'rgba(111, 167, 189, 0.12)' },
  ]

  plots.forEach((plot) => {
    ctx.beginPath()
    ctx.setFillStyle(plot.color)
    ctx.moveTo(plot.x, plot.y)
    ctx.lineTo(plot.x + plot.w * 0.85, plot.y - 12)
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h * 0.7)
    ctx.lineTo(plot.x + 18, plot.y + plot.h)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.setStrokeStyle('rgba(255, 254, 247, 0.16)')
    ctx.setLineWidth(1)
    ctx.moveTo(plot.x + 10, plot.y + 12)
    ctx.lineTo(plot.x + plot.w - 8, plot.y + 4)
    ctx.stroke()
  })

  const leaves = [
    { x: 302, y: 40, r: 18, a: -0.45 },
    { x: 332, y: 62, r: 12, a: 0.4 },
    { x: 55, y: 48, r: 10, a: -0.2 },
    { x: 86, y: 174, r: 14, a: 0.3 },
  ]

  leaves.forEach((leaf) => {
    ctx.save()
    ctx.translate(leaf.x, leaf.y)
    ctx.rotate(leaf.a)
    ctx.beginPath()
    ctx.setFillStyle('rgba(232, 244, 232, 0.16)')
    ctx.moveTo(0, -leaf.r)
    ctx.bezierCurveTo(leaf.r * 0.9, -leaf.r * 0.2, leaf.r * 0.72, leaf.r * 0.8, 0, leaf.r)
    ctx.bezierCurveTo(-leaf.r * 0.72, leaf.r * 0.8, -leaf.r * 0.9, -leaf.r * 0.2, 0, -leaf.r)
    ctx.fill()
    ctx.beginPath()
    ctx.setStrokeStyle('rgba(255, 254, 247, 0.2)')
    ctx.setLineWidth(0.8)
    ctx.moveTo(0, -leaf.r * 0.65)
    ctx.lineTo(0, leaf.r * 0.68)
    ctx.stroke()
    ctx.restore()
  })

  ctx.setFillStyle('rgba(255, 254, 247, 0.18)')
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 47) % 360
    const y = 24 + ((i * 31) % 160)
    ctx.fillRect(x, y, 1.2, 1.2)
  }

  ctx.beginPath()
  ctx.setStrokeStyle('rgba(255, 254, 247, 0.22)')
  ctx.setLineWidth(1)
  ctx.moveTo(22, 34)
  ctx.bezierCurveTo(96, 12, 178, 22, 256, 8)
  ctx.stroke()

  ctx.draw()
}

const drawPlot = (ctx: UniApp.CanvasContext) => {
  ctx.clearRect(0, 0, 375, 220)
  ctx.setFillStyle('#f8f5ec')
  ctx.fillRect(0, 0, 375, 220)

  ctx.setStrokeStyle('rgba(122, 101, 72, 0.22)')
  ctx.setLineWidth(1)
  for (let i = 0; i < 10; i += 1) {
    const y = 20 + i * 22
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(88, y + 12, 172, y - 16, 375, y + 8)
    ctx.stroke()
  }

  ctx.draw()
}

const draw = () => {
  try {
    const ctx = uni.createCanvasContext(props.canvasId)
    if (props.variant === 'plot') {
      drawPlot(ctx)
    } else {
      drawHero(ctx)
    }
  } catch (_error) {
    canvasReady.value = false
  }
}

onMounted(() => {
  redrawTimer = setTimeout(draw, 40)
})

onBeforeUnmount(() => {
  if (redrawTimer) {
    clearTimeout(redrawTimer)
    redrawTimer = null
  }
})
</script>

<style scoped lang="scss">
.farm-pattern-canvas,
.farm-pattern-fallback {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.farm-pattern-fallback {
  background: var(--acm-bg-field-hero-fallback);
}
</style>
