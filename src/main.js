// #ifdef H5
/**
 * PC 浏览器移动端预览壳 — 仅在 H5 平台生效
 * 当 PC 浏览器（宽度 > 768px）访问非 admin 页面时，将页面包裹在一个
 * 480px 宽度的 iframe 中，使 rpx/vw/fixed/tabbar 在真实手机视口下渲染。
 */
;(function initMobilePreviewShell() {
  // 完整路径（含 hash）用于判断 admin
  var fullPath = window.location.pathname + window.location.search + window.location.hash

  // admin 页面不套壳
  if (fullPath.indexOf('pages/admin') !== -1 || fullPath.indexOf('admin') !== -1) {
    return
  }

  // 已经在 iframe 内部，不套壳避免无限嵌套
  if (window.location.search.indexOf('__mobile_preview_inner=1') !== -1) {
    return
  }

  // 窄屏（真实移动端或小窗口）不套壳
  if (window.innerWidth <= 768) {
    return
  }

  // ===== 需要套壳：构建 PC 预览外壳 =====

  window.__MOBILE_PREVIEW_SHELL = true

  // 注入外壳样式
  var style = document.createElement('style')
  style.textContent =
    '*{margin:0;padding:0}' +
    'html,body{width:100%;height:100%}' +
    '.pc-mobile-preview-bg{' +
      'width:100vw;height:100vh;height:100dvh;' +
      'background:#e5e7eb;' +
      'display:flex;justify-content:center;align-items:center;' +
      'overflow:hidden' +
    '}' +
    '.pc-mobile-preview-phone{' +
      'width:480px;height:100vh;height:100dvh;' +
      'background:#f7f8fa;' +
      'box-shadow:0 0 32px rgba(15,23,42,0.18);' +
      'overflow:hidden;position:relative' +
    '}' +
    '.pc-mobile-preview-iframe{' +
      'width:100%;height:100%;' +
      'border:none;display:block;background:#f7f8fa' +
    '}' +
    '@media screen and (max-width:768px){' +
      '.pc-mobile-preview-bg{display:block;background:#f7f8fa}' +
      '.pc-mobile-preview-phone{width:100%;box-shadow:none}' +
    '}'
  document.head.appendChild(style)

  // 构建 iframe src：保留完整 URL + 标记参数，避免无限嵌套
  var currentUrl = new URL(window.location.href)
  currentUrl.searchParams.set('__mobile_preview_inner', '1')

  // 替换 body 内容为外壳
  document.body.innerHTML =
    '<div class="pc-mobile-preview-bg">' +
      '<div class="pc-mobile-preview-phone">' +
        '<iframe class="pc-mobile-preview-iframe" src="' + currentUrl.toString() + '" frameborder="0"></iframe>' +
      '</div>' +
    '</div>'
})()
// #endif

import {
  createSSRApp
} from "vue";
import { createPinia } from 'pinia'
import App from "./App.vue";
import { ensureAuthenticatedRoute } from './utils/auth-guard'

export function createApp() {
  // #ifdef H5
  // 外壳页面不需要挂载真实 App（DOM 已被外壳替换，无 #app）
  if (window.__MOBILE_PREVIEW_SHELL) {
    return { app: null }
  }
  // #endif

  const app = createSSRApp(App);
  const pinia = createPinia()
  app.use(pinia)
  app.mixin({
    onShow() {
      ensureAuthenticatedRoute()
    },
  })
  return {
    app,
  };
}
