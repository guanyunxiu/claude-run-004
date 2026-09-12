<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElColorPicker, ElInputNumber, ElOption, ElSelect, ElSwitch, ElButton, ElDivider, ElCollapse, ElCollapseItem, ElMessage } from 'element-plus'
import { useEditor } from '@/store/useEditor'
import { rad2deg, normDeg } from '@/lib/format'
import { getFurnitureDef } from '@/lib/furniture'
import type { DimensionElement, DoorElement, FurnitureElement, WallElement, WindowElement } from '@/types'

const editor = useEditor()
const { state } = editor

const sel = computed(() => editor.selectedElements.value)

const selectedWalls = computed(() => sel.value.filter((e): e is WallElement => e.kind === 'wall'))
const wall = computed<WallElement | null>(() => selectedWalls.value[0] ?? null)
const door = computed<DoorElement | null>(() => sel.value.find((e) => e.kind === 'door') as DoorElement ?? null)
const win = computed<WindowElement | null>(() => sel.value.find((e) => e.kind === 'window') as WindowElement ?? null)
const dim = computed<DimensionElement | null>(() => sel.value.find((e) => e.kind === 'dimension') as DimensionElement ?? null)
const fur = computed<FurnitureElement | null>(
  () => sel.value.find((e) => e.kind === 'furniture') as FurnitureElement ?? null
)
const furDef = computed(() => (fur.value ? getFurnitureDef(fur.value.defId) : null))

const furDeg = computed({
  get: () => Math.round(normDeg(rad2deg(fur.value?.rotation ?? 0))),
  set: (v: number) => {
    if (!fur.value) return
    fur.value.rotation = ((v % 360) * Math.PI) / 180
  }
})

function patchSettings(p: Record<string, unknown>) {
  editor.updateSettings(p as never)
}

function patchWallColor(color: string) {
  if (!wall.value) return
  wall.value.color = color
}

// 批量墙体编辑
const batchThickness = ref<number>(120)
const batchColor = ref<string>('#303133')
function applyBatchThickness(v: number | undefined) {
  if (!v) return
  const n = editor.batchEditSelectedWalls({ thickness: v })
  if (n) ElMessage.success(`已更新 ${selectedWalls.value.length} 面墙的墙厚`)
}
function applyBatchColor(c: string | null) {
  if (!c) return
  batchColor.value = c
  const n = editor.batchEditSelectedWalls({ color: c })
  if (n) ElMessage.success(`已更新 ${selectedWalls.value.length} 面墙的颜色`)
}

// 墙体工具
const healTol = ref(150)
function doTrim() {
  const r = editor.trimIntersectingWalls()
  if (!r.changed) ElMessage.info('没有需要裁剪的相交墙体')
  else ElMessage.success(`相交裁剪完成（删除 ${r.removed} 面完全被覆盖的墙）`)
}
function doHeal() {
  const r = editor.healBrokenWalls(healTol.value)
  if (!r.snapped && !r.merged) ElMessage.info('未发现可修复的断线')
  else ElMessage.success(`断线修复：吸附端点 ${r.snapped} 处，合并 ${r.merged} 段`)
}

// 层级
function reorder(dir: 'front' | 'back' | 'up' | 'down') {
  editor.reorderSelected(dir)
}

const activePanels = ref(['global'])
function del() {
  editor.removeElements([...state.selection])
}
</script>

<template>
  <div class="prop-panel">
    <div class="title">属性</div>

    <div v-if="sel.length === 0" class="hint">
      未选中图元
      <p>在画布中点选 / 框选图元，或使用左侧工具开始绘制。</p>
    </div>

    <!-- 墙体（单选 / 多选批量编辑） -->
    <div v-if="selectedWalls.length" class="group">
      <div class="group-title">
        墙体{{ selectedWalls.length > 1 ? ` · 已选 ${selectedWalls.length} 面（批量编辑）` : '' }}
      </div>
      <div class="row">
        <span>墙厚 (mm)</span>
        <el-input-number
          :model-value="wall?.thickness"
          :min="40"
          :max="600"
          :step="10"
          size="small"
          controls-position="right"
          :placeholder="selectedWalls.length > 1 ? '批量' : ''"
          @update:model-value="(v) => v && (selectedWalls.length > 1 ? applyBatchThickness(v) : (wall!.thickness = v))"
        />
      </div>
      <div class="row">
        <span>颜色</span>
        <el-color-picker
          :model-value="wall?.color"
          size="small"
          @change="(v: string | null) => { if (!v) return; selectedWalls.length > 1 ? applyBatchColor(v) : patchWallColor(v) }"
        />
      </div>
      <div v-if="selectedWalls.length === 1" class="row static">
        <span>顶点数</span><b>{{ wall?.points.length }}</b>
      </div>

      <!-- 墙体工具 -->
      <div class="sub-title">墙体工具</div>
      <div class="btn-grid">
        <el-button size="small" plain @click="doTrim">相交裁剪</el-button>
        <el-button size="small" plain @click="doHeal">断线修复</el-button>
      </div>
      <div class="row">
        <span>修复容差 (mm)</span>
        <el-input-number v-model="healTol" :min="10" :max="2000" :step="10" size="small" controls-position="right" />
      </div>
    </div>

    <!-- 门 -->
    <template v-if="door">
      <div class="group">
        <div class="group-title">平开门</div>
        <div class="row">
          <span>门洞宽 (mm)</span>
          <el-input-number v-model="door.width" :min="500" :max="2000" :step="50" size="small" controls-position="right" />
        </div>
        <div class="row">
          <span>合页端</span>
          <el-select v-model="door.hinge" size="small" style="width: 110px">
            <el-option label="起点端" value="start" />
            <el-option label="终点端" value="end" />
          </el-select>
        </div>
        <div class="row">
          <span>开启方向</span>
          <el-select v-model="door.swingSide" size="small" style="width: 110px">
            <el-option label="左侧" :value="1" />
            <el-option label="右侧" :value="-1" />
          </el-select>
        </div>
        <div class="row static">
          <span>位置 (mm)</span><b>{{ Math.round(door.offset) }}</b>
        </div>
      </div>
    </template>

    <!-- 窗 -->
    <div v-if="win" class="group">
      <div class="group-title">固定窗</div>
      <div class="row">
        <span>窗宽 (mm)</span>
        <el-input-number v-model="win.width" :min="300" :max="4000" :step="100" size="small" controls-position="right" />
      </div>
      <div class="row static">
        <span>位置 (mm)</span><b>{{ Math.round(win.offset) }}</b>
      </div>
    </div>

    <!-- 家具 -->
    <div v-if="fur" class="group">
      <div class="group-title">{{ furDef?.name ?? '家具' }}</div>
      <div class="row">
        <span>宽度 (mm)</span>
        <el-input-number v-model="fur.width" :min="200" :max="6000" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>深度 (mm)</span>
        <el-input-number v-model="fur.height" :min="200" :max="6000" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>旋转 (°)</span>
        <el-input-number v-model="furDeg" :min="0" :max="359" :step="15" size="small" controls-position="right" />
      </div>
      <el-button size="small" plain @click="furDeg = (furDeg + 90) % 360">旋转 90°</el-button>
    </div>

    <!-- 标注 -->
    <div v-if="dim" class="group">
      <div class="group-title">{{ dim.dimType === 'angle' ? '角度标注' : '线性标注' }}</div>
      <div v-if="dim.dimType === 'angle'" class="row">
        <span>弧半径 (mm)</span>
        <el-input-number v-model="dim.radius" :min="150" :max="10000" :step="50" size="small" controls-position="right" />
      </div>
      <div v-else class="row">
        <span>偏移 (mm)</span>
        <el-input-number v-model="dim.offsetDistance" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>颜色</span>
        <el-color-picker v-model="dim.color" size="small" />
      </div>
      <div class="row">
        <span>线宽 (px)</span>
        <el-input-number v-model="dim.strokeWidth" :min="0.5" :max="6" :step="0.5" size="small" controls-position="right" />
      </div>
      <div class="row static" v-if="dim.dimType === 'linear'">
        <span>长度 (mm)</span><b>{{ Math.round(Math.hypot(dim.p2.x - dim.p1.x, dim.p2.y - dim.p1.y)) }}</b>
      </div>
    </div>

    <!-- 层级 / 编辑操作 -->
    <template v-if="sel.length">
      <div class="group">
        <div class="group-title">编辑 / 层级</div>
        <div class="btn-grid">
          <el-button size="small" plain @click="editor.copySelected(false)">复制</el-button>
          <el-button size="small" plain @click="editor.pasteAt()">粘贴</el-button>
          <el-button size="small" plain @click="editor.duplicateSelected()">副本</el-button>
        </div>
        <div class="btn-grid">
          <el-button size="small" plain title="上移一层（同类型内）" @click="reorder('up')">上移</el-button>
          <el-button size="small" plain title="下移一层（同类型内）" @click="reorder('down')">下移</el-button>
          <el-button size="small" plain title="置于顶层" @click="reorder('front')">置顶</el-button>
          <el-button size="small" plain title="置于底层" @click="reorder('back')">置底</el-button>
        </div>
      </div>
    </template>

    <el-divider v-if="sel.length" />
    <el-button v-if="sel.length" type="danger" plain size="small" class="del-btn" @click="del">
      删除选中 ({{ state.selection.size }})
    </el-button>

    <el-divider />

    <!-- 全局设置 -->
    <el-collapse v-model="activePanels" class="settings-collapse">
      <el-collapse-item title="全局样式 / 画布" name="global">
        <div class="row">
          <span>默认墙厚</span>
          <el-input-number
            :model-value="state.doc.settings.wallThickness"
            :min="40"
            :max="600"
            :step="10"
            size="small"
            controls-position="right"
            @update:model-value="(v) => v && patchSettings({ wallThickness: v })"
          />
        </div>
        <div class="row">
          <span>墙体颜色</span>
          <el-color-picker
            :model-value="state.doc.settings.wallColor"
            size="small"
            @change="(v: string | null) => v && patchSettings({ wallColor: v })"
          />
        </div>
        <div class="row">
          <span>标注颜色</span>
          <el-color-picker
            :model-value="state.doc.settings.dimColor"
            size="small"
            @change="(v: string | null) => v && patchSettings({ dimColor: v })"
          />
        </div>
        <div class="row">
          <span>标注线宽</span>
          <el-input-number
            :model-value="state.doc.settings.dimStrokeWidth"
            :min="0.5"
            :max="6"
            :step="0.5"
            size="small"
            controls-position="right"
            @update:model-value="(v) => v && patchSettings({ dimStrokeWidth: v })"
          />
        </div>
        <div class="row">
          <span>背景色</span>
          <el-color-picker
            :model-value="state.doc.settings.bgColor"
            size="small"
            show-alpha
            @change="(v: string | null) => v && patchSettings({ bgColor: v })"
          />
        </div>
        <div class="row">
          <span>显示网格</span>
          <el-switch
            :model-value="state.doc.settings.showGrid"
            @update:model-value="(v) => patchSettings({ showGrid: v })"
          />
        </div>
        <div class="row">
          <span>显示标尺</span>
          <el-switch
            :model-value="state.doc.settings.showRulers"
            @update:model-value="(v) => patchSettings({ showRulers: v })"
          />
        </div>
        <div class="row">
          <span>90° 正交</span>
          <el-switch
            :model-value="state.doc.settings.ortho"
            @update:model-value="(v) => patchSettings({ ortho: v })"
          />
        </div>
        <div class="row">
          <span>45° 角度锁定</span>
          <el-switch
            :model-value="state.doc.settings.angleLock45"
            @update:model-value="(v) => patchSettings({ angleLock45: v })"
          />
        </div>
        <div class="row">
          <span>启用吸附</span>
          <el-switch
            :model-value="state.doc.settings.snapEnabled"
            @update:model-value="(v) => patchSettings({ snapEnabled: v })"
          />
        </div>
        <div class="row">
          <span>吸附阈值 (px)</span>
          <el-input-number
            :model-value="state.doc.settings.snapTol"
            :min="2"
            :max="40"
            :step="1"
            size="small"
            controls-position="right"
            @update:model-value="(v) => v && patchSettings({ snapTol: v })"
          />
        </div>
        <div class="row">
          <span>端点吸附</span>
          <el-switch
            :model-value="state.doc.settings.snapEndpoint"
            @update:model-value="(v) => patchSettings({ snapEndpoint: v })"
          />
        </div>
        <div class="row">
          <span>中点吸附</span>
          <el-switch
            :model-value="state.doc.settings.snapMidpoint"
            @update:model-value="(v) => patchSettings({ snapMidpoint: v })"
          />
        </div>
        <div class="row">
          <span>交点吸附</span>
          <el-switch
            :model-value="state.doc.settings.snapIntersection"
            @update:model-value="(v) => patchSettings({ snapIntersection: v })"
          />
        </div>
        <div class="row">
          <span>画墙自动裁剪</span>
          <el-switch
            :model-value="state.doc.settings.autoTrim"
            @update:model-value="(v) => patchSettings({ autoTrim: v })"
          />
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.prop-panel {
  position: absolute;
  right: 12px;
  top: 12px;
  bottom: 12px;
  width: 264px;
  z-index: 20;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--fp-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 12px 14px;
  overflow-y: auto;
}
.title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 8px;
}
.hint {
  color: #909399;
  font-size: 12px;
}
.hint p {
  margin-top: 6px;
  line-height: 1.6;
}
.group {
  margin-bottom: 10px;
}
.sub-title {
  font-size: 11px;
  color: #909399;
  margin: 8px 0 4px;
}
.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 6px;
}
.btn-grid .el-button {
  margin: 0;
}
.group-title {
  font-size: 12px;
  font-weight: 600;
  color: #1d6fe0;
  margin-bottom: 6px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
  gap: 8px;
}
.row.static b {
  color: #303133;
  font-weight: 500;
}
.del-btn {
  width: 100%;
}
.settings-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  font-weight: 600;
}
</style>
