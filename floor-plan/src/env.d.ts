/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  /** 调试/自动化测试钩子（编辑器 store） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __fp?: any
}
