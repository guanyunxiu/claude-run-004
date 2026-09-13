<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElColorPicker, ElInputNumber, ElOption, ElSelect, ElSwitch, ElButton, ElDivider, ElCollapse, ElCollapseItem, ElInput, ElMessage } from 'element-plus'
import { useEditor } from '@/store/useEditor'
import { rad2deg, normDeg } from '@/lib/format'
import { getFurnitureDef } from '@/lib/furniture'
import type { DimensionElement, DoorElement, FurnitureElement, StructureElement, WallElement, WindowElement } from '@/types'

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
const struct = computed<StructureElement | null>(
  () => sel.value.find((e) => e.kind === 'structure') as StructureElement ?? null
)
const movables = computed(() =>
  sel.value.filter((e): e is FurnitureElement | StructureElement => e.kind === 'furniture' || e.kind === 'structure')
)
const furDef = computed(() => (fur.value ? getFurnitureDef(fur.value.defId) : null))

// 单选家具/结构时共用的编辑对象
const boxSel = computed(() => (movables.value.length === 1 ? movables.value[0] : null))
const furDeg = computed({
  get: () => Math.round(normDeg(rad2deg(boxSel.value?.rotation ?? 0))),
  set: (v: number) => {
    if (boxSel.value) boxSel.value.rotation = ((v % 360) * Math.PI) / 180
  }
})

function patchSettings(p: Record<string, unknown>) {
  editor.updateSettings(p as never)
}
function patchWallColor(color: string) {
  if (wall.value) wall.value.color = color
}

// 批量墙体
const batchThickness = ref(120)
const batchColor = ref('#303133')
function applyBatchThickness(v: number | undefined) {
  if (v && editor.batchEditSelectedWalls({ thickness: v })) ElMessage.success(`已更新 ${selectedWalls.value.length} 面墙的墙厚`)
}
function applyBatchColor(c: string | null) {
  if (c && editor.batchEditSelectedWalls({ color: c })) ElMessage.success(`已更新 ${selectedWalls.value.length} 面墙的颜色`)
}

// 墙体工具
const healTol = ref(150)
function doTrim() {
  const r = editor.trimIntersectingWalls()
  ElMessage[r.changed ? 'success' : 'info'](r.changed ? `相交裁剪完成（删除 ${r.removed} 面墙）` : '没有需要裁剪的相交墙体')
}
function doHeal() {
  const r = editor.healBrokenWalls(healTol.value)
  ElMessage[r.snapped || r.merged ? 'success' : 'info'](
    r.snapped || r.merged ? `断线修复：吸附 ${r.snapped} 处，合并 ${r.merged} 段` : '未发现可修复的断线'
  )
}
function doJoin() {
  if (editor.joinSelectedWalls(healTol.value)) ElMessage.success('已合并两面墙')
  else ElMessage.info('请选中两面端点相接、同厚度的开放墙')
}

// 层级
function reorder(dir: 'front' | 'back' | 'up' | 'down') {
  editor.reorderSelected(dir)
}

// 对齐 / 分布 / 阵列
function align(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  editor.alignSelected(mode)
}
function distribute(mode: 'horizontal' | 'vertical') {
  editor.distributeSelected(mode)
}
const arrAxis = ref<'x' | 'y'>('x')
const arrSpacing = ref(800)
const arrCount = ref(3)
function doArray() {
  const n = editor.arraySelected({ axis: arrAxis.value, spacing: arrSpacing.value, count: arrCount.value })
  if (n) ElMessage.success(`已阵列复制 ${n} 个`)
}

// 房间
const room = computed(() => editor.selectedRoom.value)
const roomName = ref('')
const roomFill = ref('')
watch(
  room,
  (r) => {
    roomName.value = r?.meta?.name ?? ''
    roomFill.value = r?.meta?.fill ?? ''
  },
  { immediate: true }
)
function applyRoomName() {
  if (room.value) editor.setRoomName(room.value, roomName.value)
}
function applyRoomFill(c: string | null) {
  if (room.value) editor.setRoomFill(room.value, c ?? '')
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
        <el-button size="small" plain title="选中两面端点相接的开放墙" @click="doJoin">合并两墙</el-button>
      </div>
      <div class="mini-tip">Alt+点墙身插入顶点 · Ctrl+Alt+点顶点删除 · Shift+Alt+点墙身打断</div>
      <div class="row">
        <span>修复容差 (mm)</span>
        <el-input-number v-model="healTol" :min="10" :max="2000" :step="10" size="small" controls-position="right" />
      </div>
    </div>

    <!-- 门 -->
    <template v-if="door">
      <div class="group">
        <div class="group-title">{{ door.doorStyle === 'sliding' ? '推拉门' : door.doorStyle === 'double' ? '双开门' : '平开门' }}</div>
        <div class="row">
          <span>门型</span>
          <el-select v-model="door.doorStyle" size="small" style="width: 110px">
            <el-option label="平开门" value="swing" />
            <el-option label="推拉门" value="sliding" />
            <el-option label="双开门" value="double" />
          </el-select>
        </div>
        <div class="row">
          <span>门洞宽 (mm)</span>
          <el-input-number v-model="door.width" :min="500" :max="2000" :step="50" size="small" controls-position="right" />
        </div>
        <template v-if="(door.doorStyle ?? 'swing') !== 'sliding'">
          <div class="row" v-if="(door.doorStyle ?? 'swing') === 'swing'">
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
        </template>
        <div class="row static">
          <span>位置 (mm)</span><b>{{ Math.round(door.offset) }}</b>
        </div>
      </div>
    </template>

    <!-- 窗 -->
    <div v-if="win" class="group">
      <div class="group-title">{{ win.winStyle === 'sliding' ? '推拉窗' : win.winStyle === 'casement' ? '平开窗' : '固定窗' }}</div>
      <div class="row">
        <span>窗型</span>
        <el-select v-model="win.winStyle" size="small" style="width: 110px">
          <el-option label="固定窗" value="fixed" />
          <el-option label="推拉窗" value="sliding" />
          <el-option label="平开窗" value="casement" />
        </el-select>
      </div>
      <div class="row">
        <span>窗宽 (mm)</span>
        <el-input-number v-model="win.width" :min="300" :max="4000" :step="100" size="small" controls-position="right" />
      </div>
      <div class="row static">
        <span>位置 (mm)</span><b>{{ Math.round(win.offset) }}</b>
      </div>
    </div>

    <!-- 家具 -->
    <div v-if="fur && boxSel" class="group">
      <div class="group-title">{{ furDef?.name ?? '家具' }}</div>
      <div class="row">
        <span>宽度 (mm)</span>
        <el-input-number v-model="boxSel.width" :min="200" :max="6000" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>深度 (mm)</span>
        <el-input-number v-model="boxSel.height" :min="200" :max="6000" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>旋转 (°)</span>
        <el-input-number v-model="furDeg" :min="0" :max="359" :step="15" size="small" controls-position="right" />
      </div>
      <el-button size="small" plain @click="furDeg = (furDeg + 90) % 360">旋转 90°</el-button>
    </div>

    <!-- 结构构件 -->
    <div v-if="struct && boxSel" class="group">
      <div class="group-title">{{ struct.structKind === 'column' ? '柱子' : struct.structKind === 'flue' ? '烟道/管井' : '地台' }}</div>
      <div class="row">
        <span>宽度 (mm)</span>
        <el-input-number v-model="boxSel.width" :min="80" :max="6000" :step="10" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>深度 (mm)</span>
        <el-input-number v-model="boxSel.height" :min="80" :max="6000" :step="10" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>旋转 (°)</span>
        <el-input-number v-model="furDeg" :min="0" :max="359" :step="15" size="small" controls-position="right" />
      </div>
      <div class="row" v-if="struct.structKind !== 'platform'">
        <span>扣减房间净面积</span>
        <el-switch v-model="struct.deduct" />
      </div>
      <el-button size="small" plain @click="furDeg = (furDeg + 90) % 360">旋转 90°</el-button>
    </div>

    <!-- 对齐 / 分布 / 阵列（≥2 个家具/结构） -->
    <div v-if="movables.length >= 2" class="group">
      <div class="group-title">对齐 ({{ movables.length }})</div>
      <div class="btn-grid btn-grid-3">
        <el-button size="small" plain title="左对齐" @click="align('left')">左</el-button>
        <el-button size="small" plain title="水平居中" @click="align('hcenter')">水平居中</el-button>
        <el-button size="small" plain title="右对齐" @click="align('right')">右</el-button>
        <el-button size="small" plain title="顶对齐" @click="align('top')">顶</el-button>
        <el-button size="small" plain title="垂直居中" @click="align('vcenter')">垂直居中</el-button>
        <el-button size="small" plain title="底对齐" @click="align('bottom')">底</el-button>
      </div>
      <div v-if="movables.length >= 3" class="btn-grid">
        <el-button size="small" plain @click="distribute('horizontal')">水平等距</el-button>
        <el-button size="small" plain @click="distribute('vertical')">垂直等距</el-button>
      </div>
    </div>

    <!-- 阵列复制（单选家具/结构） -->
    <div v-if="movables.length === 1" class="group">
      <div class="group-title">阵列复制</div>
      <div class="row">
        <span>方向</span>
        <el-select v-model="arrAxis" size="small" style="width: 90px">
          <el-option label="X 轴" value="x" />
          <el-option label="Y 轴" value="y" />
        </el-select>
      </div>
      <div class="row">
        <span>中心间距</span>
        <el-input-number v-model="arrSpacing" :min="100" :max="20000" :step="50" size="small" controls-position="right" />
      </div>
      <div class="row">
        <span>总数(含本)</span>
        <el-input-number v-model="arrCount" :min="2" :max="50" :step="1" size="small" controls-position="right" />
      </div>
      <el-button size="small" plain style="width: 100%" @click="doArray">生成阵列</el-button>
    </div>

    <!-- 房间 -->
    <div v-if="room" class="group">
      <div class="group-title">房间</div>
      <div class="row">
        <span>名称</span>
        <el-input v-model="roomName" size="small" style="width: 130px" placeholder="如：主卧" @change="applyRoomName" />
      </div>
      <div class="row">
        <span>填充色</span>
        <el-color-picker :model-value="roomFill || undefined" show-alpha size="small" @change="applyRoomFill" />
        <el-button v-if="roomFill" size="small" text @click="applyRoomFill('')">清除</el-button>
      </div>
      <div class="row static">
        <span>建筑面积</span><b>{{ (room.area / 1e6).toFixed(2) }} ㎡</b>
      </div>
      <div class="row static" v-if="room.netArea < room.area - 1">
        <span>净面积(扣柱/烟道)</span><b>{{ (room.netArea / 1e6).toFixed(2) }} ㎡</b>
      </div>
      <div class="mini-tip">可直接拖动房间名称标签调整位置</div>
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
          <el-button size="small" plain title="在所有图元中上移一层" @click="reorder('up')">上移</el-button>
          <el-button size="small" plain title="在所有图元中下移一层" @click="reorder('down')">下移</el-button>
          <el-button size="small" plain title="置于所有图元最顶层" @click="reorder('front')">置顶</el-button>
          <el-button size="small" plain title="置于所有图元最底层" @click="reorder('back')">置底</el-button>
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
        <div class="row">
          <span>家具靠墙吸附</span>
          <el-switch
            :model-value="state.doc.settings.furnitureSnap"
            @update:model-value="(v) => patchSettings({ furnitureSnap: v })"
          />
        </div>
        <div class="row">
          <span>重叠时禁止落下</span>
          <el-switch
            :model-value="state.doc.settings.collisionBlock"
            @update:model-value="(v) => patchSettings({ collisionBlock: v })"
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
.btn-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}
.mini-tip {
  font-size: 10px;
  color: #a8abb2;
  line-height: 1.5;
  margin: 4px 0 6px;
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
