<script setup lang="ts">
import type { ToolMode } from '@/types'
import { useEditor } from '@/store/useEditor'

const editor = useEditor()
const { state } = editor

const tools: { mode: ToolMode; label: string; icon: string; shortcut: string }[] = [
  { mode: 'select', label: '选择 / 框选', icon: 'select', shortcut: 'V' },
  { mode: 'pan', label: '平移（或按住空格）', icon: 'pan', shortcut: '空格' },
  { mode: 'wall', label: '绘制墙体', icon: 'wall', shortcut: 'W' },
  { mode: 'door', label: '放置平开门', icon: 'door', shortcut: 'D' },
  { mode: 'window', label: '放置固定窗', icon: 'window', shortcut: 'C' },
  { mode: 'dimension', label: '线性标注', icon: 'dim', shortcut: 'L' },
  { mode: 'angle-dim', label: '角度标注', icon: 'angle', shortcut: 'A' },
  { mode: 'measure', label: '临时测距', icon: 'measure', shortcut: 'M' }
]

function pick(mode: ToolMode) {
  editor.setMode(mode)
}
</script>

<template>
  <div class="toolbar">
    <button
      v-for="t in tools"
      :key="t.mode"
      class="tool-btn"
      :class="{ active: state.mode === t.mode }"
      :title="`${t.label}（${t.shortcut}）`"
      @click="pick(t.mode)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">
        <template v-if="t.icon === 'select'">
          <path d="M5 3l14 8-6 1.5L9.5 19z" stroke-linejoin="round" />
        </template>
        <template v-else-if="t.icon === 'pan'">
          <path d="M8 12V6a1.5 1.5 0 013 0v5m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-1a6 6 0 01-5.2-3l-2.4-4.1a1.4 1.4 0 012.3-1.5L8 14" stroke-linecap="round" stroke-linejoin="round"/>
        </template>
        <template v-else-if="t.icon === 'wall'">
          <path d="M3 18h18M4 18V8l8-4 8 4v10" stroke-linejoin="round" />
          <path d="M4 18v-8l8-4 8 4v8" stroke-linejoin="round" opacity=".55"/>
        </template>
        <template v-else-if="t.icon === 'door'">
          <path d="M7 21V4h10v17" stroke-linejoin="round"/>
          <path d="M7 21h10" />
          <path d="M14 12a1 1 0 100-.01" stroke-width="2.4"/>
          <path d="M7 12a5 5 0 015-5" opacity=".7"/>
        </template>
        <template v-else-if="t.icon === 'window'">
          <rect x="4" y="8" width="16" height="8" />
          <path d="M4 10.7h16M4 13.3h16M12 8v8" opacity=".6"/>
        </template>
        <template v-else-if="t.icon === 'dim'">
          <path d="M4 16V8M20 16V8M4 12h16" />
          <path d="M7 9.5L4 12l3 2.5M17 9.5l3 2.5-3 2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </template>
        <template v-else-if="t.icon === 'angle'">
          <path d="M4 18h16" />
          <path d="M5 18a13 13 0 0 1 11-11" />
          <path d="M11.5 9.2l1.8-.3.3 1.8M14.5 12.4l2-.2" opacity=".75"/>
        </template>
        <template v-else-if="t.icon === 'measure'">
          <rect x="2.5" y="9" width="19" height="6" rx="1" transform="rotate(-30 12 12)" />
          <path d="M6.8 14.2l1.5-2.6M9.8 12.5l1.5-2.6M12.8 10.8l1.5-2.6" opacity=".7"/>
        </template>
      </svg>
      <span class="lbl">{{ t.label.split('（')[0].split(' /')[0] }}</span>
    </button>

    <div class="divider" />

    <button class="tool-btn" title="撤销 Ctrl+Z" :disabled="!editor.canUndo.value" @click="editor.undo()">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">
        <path d="M9 14L4 9l5-5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 9h11a5 5 0 010 10h-3" stroke-linecap="round"/>
      </svg>
      <span class="lbl">撤销</span>
    </button>
    <button class="tool-btn" title="重做 Ctrl+Shift+Z" :disabled="!editor.canRedo.value" @click="editor.redo()">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">
        <path d="M15 14l5-5-5-5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20 9H9a5 5 0 000 10h3" stroke-linecap="round"/>
      </svg>
      <span class="lbl">重做</span>
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  background: #fff;
  border: 1px solid var(--fp-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tool-btn {
  width: 64px;
  padding: 8px 4px 6px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #4a5568;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transition: background 0.12s, color 0.12s;
}
.tool-btn:hover {
  background: #f0f5ff;
  color: #1d6fe0;
}
.tool-btn.active {
  background: #e1efff;
  color: #1d6fe0;
}
.tool-btn:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
  background: transparent;
}
.tool-btn .lbl {
  font-size: 11px;
  line-height: 1.2;
}
.divider {
  height: 1px;
  background: var(--fp-border);
  margin: 4px 6px;
}
</style>
