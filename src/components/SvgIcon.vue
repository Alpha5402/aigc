<template>
  <view class="svg-icon-wrap" :style="wrapperStyle">
    <!-- #ifdef APP-PLUS -->
    <image
      v-if="imageSrc"
      class="svg-icon-image"
      :src="imageSrc"
      mode="aspectFit"
    />
    <!-- #endif -->

    <!-- #ifndef APP-PLUS -->
    <svg
      v-if="normalizedNodes.length"
      class="svg-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      :width="sizeValue"
      :height="sizeValue"
      :fill="filled ? color : 'none'"
      :stroke="color"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <template v-for="(node, index) in normalizedNodes" :key="index">
        <path v-if="node.tag === 'path'" v-bind="node.attrs" />
        <circle v-else-if="node.tag === 'circle'" v-bind="node.attrs" />
        <line v-else-if="node.tag === 'line'" v-bind="node.attrs" />
        <polyline v-else-if="node.tag === 'polyline'" v-bind="node.attrs" />
        <polygon v-else-if="node.tag === 'polygon'" v-bind="node.attrs" />
        <rect v-else-if="node.tag === 'rect'" v-bind="node.attrs" />
        <ellipse v-else-if="node.tag === 'ellipse'" v-bind="node.attrs" />
      </template>
    </svg>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import rawIconNodes from 'lucide-static/icon-nodes.json'

type IconAttrs = Record<string, string | number>
type IconNode = [string, IconAttrs]
type NormalizedIconNode = {
  tag: string
  attrs: IconAttrs
}

const iconNodes = rawIconNodes as Record<string, IconNode[]>

const customIconNodes: Record<string, IconNode[]> = {
  'crop-corn': [
    ['path', { d: 'M12 4.3c-2.9 0-5.1 2.3-5.1 5.2v4.3c0 3.4 2.2 6.2 5.1 6.2s5.1-2.8 5.1-6.2V9.5c0-2.9-2.2-5.2-5.1-5.2Z' }],
    ['path', { d: 'M8.1 10.2c-1.9 1.2-3.1 3.2-3.1 5.6 0 2.6 1.4 4.8 3.7 6' }],
    ['path', { d: 'M15.9 10.2c1.9 1.2 3.1 3.2 3.1 5.6 0 2.6-1.4 4.8-3.7 6' }],
    ['line', { x1: 10.2, y1: 9.2, x2: 10.2, y2: 15.8 }],
    ['line', { x1: 12, y1: 7.8, x2: 12, y2: 17.2 }],
    ['line', { x1: 13.8, y1: 9.2, x2: 13.8, y2: 15.8 }],
  ],
  'crop-tomato': [
    ['path', { d: 'M12 8.2c-4.2 0-7.2 2.9-7.2 6.8S7.8 21 12 21s7.2-2.4 7.2-6.1S16.2 8.2 12 8.2Z' }],
    ['path', { d: 'M12 8.2V5.6' }],
    ['path', { d: 'M12 8.2 9.3 6.9 8.1 8.8 10.6 9.5' }],
    ['path', { d: 'M12 8.2 14.7 6.9 15.9 8.8 13.4 9.5' }],
    ['circle', { cx: 9.5, cy: 14.3, r: 0.7 }],
    ['circle', { cx: 14.5, cy: 14.1, r: 0.7 }],
  ],
  'crop-potato': [
    ['path', { d: 'M12 6.5c-3.8 0-6.8 2.6-6.8 6.1S8.1 19.5 12 19.5s6.8-3.4 6.8-6.9S15.8 6.5 12 6.5Z' }],
    ['path', { d: 'M8.4 11.5c.4-.9 1.2-1.5 2.3-1.8' }],
    ['circle', { cx: 9.4, cy: 12.1, r: 0.8 }],
    ['circle', { cx: 12.2, cy: 14.1, r: 0.75 }],
    ['circle', { cx: 14.9, cy: 11.8, r: 0.7 }],
    ['path', { d: 'M13.8 8.4c.9-.2 1.8.1 2.5.8' }],
  ],
  'crop-cabbage': [
    ['path', { d: 'M12 20.5c-4.7 0-8.5-3.3-8.5-7.6 0-4 3.2-7.2 8.5-7.2s8.5 3.2 8.5 7.2c0 4.3-3.8 7.6-8.5 7.6Z' }],
    ['path', { d: 'M12 6.8c-2.1 2-3.4 4.7-3.7 7.8' }],
    ['path', { d: 'M12 6.8c2.1 2 3.4 4.7 3.7 7.8' }],
    ['path', { d: 'M7.4 11.5c1.4.9 3 .9 4.6.3' }],
    ['path', { d: 'M16.6 11.5c-1.4.9-3 .9-4.6.3' }],
    ['path', { d: 'M12 9.6v9' }],
  ],
  'crop-cucumber': [
    ['path', { d: 'M5.3 11.8c0-2.8 2.3-5.1 5.1-5.1h3.2c2.8 0 5.1 2.3 5.1 5.1s-2.3 5.1-5.1 5.1h-3.2c-2.8 0-5.1-2.3-5.1-5.1Z' }],
    ['path', { d: 'M18.6 11.1c1.3-.2 2.1-1 2.1-2.2' }],
    ['path', { d: 'M6.6 9.7c.5-.9 1.5-1.6 2.5-1.8' }],
    ['circle', { cx: 8.6, cy: 10.2, r: 0.45 }],
    ['circle', { cx: 10.7, cy: 13.2, r: 0.45 }],
    ['circle', { cx: 12.8, cy: 10.9, r: 0.45 }],
    ['circle', { cx: 14.7, cy: 13.5, r: 0.45 }],
  ],
}

const mergedIconNodes: Record<string, IconNode[]> = {
  ...iconNodes,
  ...customIconNodes,
}

interface Props {
  name: string
  size?: number | string
  color?: string
  strokeWidth?: number | string
  filled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  color: 'currentColor',
  strokeWidth: 2,
  filled: false,
})

const cssVarColorMap: Record<string, string> = {
  '--acm-brand-primary': '#367d49',
  '--acm-brand-primary-dark': '#25543a',
  '--acm-brand-primary-light': '#dcefdc',
  '--acm-primary': '#367d49',
  '--acm-primary-dark': '#25543a',
  '--acm-primary-light': '#74ad7a',
  '--acm-text-primary': '#213528',
  '--acm-text-regular': '#4d5f52',
  '--acm-text-secondary': '#748074',
  '--acm-text-muted': '#748074',
  '--acm-text-subtle': '#a6afa6',
  '--acm-success': '#3f8f56',
  '--acm-success-text': '#2f7244',
  '--acm-warning': '#c98f24',
  '--acm-warning-deep': '#8a5f14',
  '--acm-warning-text': '#8a5f14',
  '--acm-danger': '#bd554d',
  '--acm-danger-text': '#9f3f38',
  '--acm-info': '#5b91a8',
  '--acm-info-text': '#3f7085',
  '--acm-price-up': '#c98024',
  '--acm-price-down': '#3d7f68',
  '--acm-crop-leaf': '#4e9a61',
  '--acm-soil-earth': '#7a6548',
  '--acm-harvest-gold': '#d6a83a',
  '--acm-sky-data': '#6fa7bd',
  '--acm-fruit-orange': '#ad5a1e',
  '--acm-white': '#fffef9',
  '--acm-bg-card': '#fffef9',
  '--acm-text-inverse': '#fffef7',
}

const iconNameAliases: Record<string, string> = {
  'alert-triangle': 'triangle-alert',
  'check-circle-2': 'circle-check',
  'alert-circle': 'circle-alert',
}

const resolveColor = (inputColor: string) => {
  if (!inputColor) return '#666666'
  if (inputColor === 'currentColor') return '#666666'

  const match = inputColor.match(/^var\((--[^\)\s]+)\)$/)
  if (match) {
    return cssVarColorMap[match[1]] || '#666666'
  }

  return inputColor
}

const sizeValue = computed(() => {
  if (typeof props.size === 'number') {
    return `${props.size}px`
  }
  if (/^\d+$/.test(props.size)) {
    return `${props.size}px`
  }
  return props.size
})

const normalizedNodes = computed<NormalizedIconNode[]>(() => {
  const normalizedName = iconNameAliases[props.name] || props.name
  const nodes = mergedIconNodes[normalizedName] || []
  return nodes.map((node) => ({ tag: node[0], attrs: node[1] || {} }))
})

const resolvedColor = computed(() => resolveColor(props.color))

const attrsToString = (attrs: IconAttrs) => {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ')
}

const appSvgMarkup = computed(() => {
  if (!normalizedNodes.value.length) return ''

  const children = normalizedNodes.value
    .map((node) => `<${node.tag} ${attrsToString(node.attrs)} />`)
    .join('')

  const fillColor = props.filled ? resolvedColor.value : 'none'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fillColor}" stroke="${resolvedColor.value}" stroke-width="${props.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
})

const imageSrc = computed(() => {
  if (!appSvgMarkup.value) return ''
  return `data:image/svg+xml;utf8,${encodeURIComponent(appSvgMarkup.value)}`
})

const wrapperStyle = computed(() => ({
  width: sizeValue.value,
  height: sizeValue.value,
  color: props.color,
}))
</script>

<style scoped lang="scss">
.svg-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
}

.svg-icon {
  display: block;
}

.svg-icon-image {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
