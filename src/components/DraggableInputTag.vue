<script lang="ts" setup>
import {ref, watch, nextTick} from "vue";
import {Delete} from "@element-plus/icons-vue";

const props = withDefaults(defineProps<{
  tagType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  tagEffect?: 'dark' | 'light' | 'plain'
  delimiter?: string
  clearable?: boolean
  size?: 'large' | 'default' | 'small'
}>(), {
  tagType: 'primary',
  tagEffect: 'light',
  clearable: false,
  size: 'default'
})

const emit = defineEmits<{
  (e: 'change', value: string[]): void
}>()

const modelValue = defineModel<string[]>({default: () => []})
const inputValue = ref('')

interface TagItem {
  id: string
  value: string
}

let idCounter = 0
function buildItem(value: string): TagItem {
  return {id: `tag-${idCounter++}-${value}`, value}
}

const list = ref<TagItem[]>([])
const pressingIndex = ref<number | null>(null)
const draggingIndex = ref<number | null>(null)
const hoverIndex = ref<number | null>(null)
let pointerStartX = 0
let pointerStartY = 0
let syncing = false

function syncFromModel() {
  syncing = true
  const newList = modelValue.value.map(value => buildItem(value))
  if (JSON.stringify(list.value.map(i => i.value)) !== JSON.stringify(newList.map(i => i.value))) {
    list.value = newList
  }
  nextTick(() => { syncing = false })
}

watch(() => modelValue.value, () => {
  if (!syncing) syncFromModel()
}, {deep: true, immediate: true})

function updateModel() {
  syncing = true
  modelValue.value = list.value.map(item => item.value)
  emit('change', modelValue.value)
  nextTick(() => { syncing = false })
}

function addTags() {
  const raw = inputValue.value.trim()
  if (!raw) return
  const delimiter = props.delimiter || ','
  const newTags = raw
      .split(delimiter)
      .map(t => t.trim())
      .filter(t => t && !list.value.some(item => item.value === t))
      .map(value => buildItem(value))
  if (newTags.length > 0) {
    list.value.push(...newTags)
    updateModel()
  }
  inputValue.value = ''
}

function removeTag(index: number) {
  list.value = list.value.filter((_, i) => i !== index)
  updateModel()
}

function clearAll() {
  if (list.value.length === 0) return
  list.value = []
  updateModel()
}

function handlePointerDown(index: number, event: PointerEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.el-tag__close')) return

  pressingIndex.value = index
  pointerStartX = event.clientX
  pointerStartY = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (pressingIndex.value === null) return

  if (draggingIndex.value === null) {
    const offsetX = event.clientX - pointerStartX
    const offsetY = event.clientY - pointerStartY
    if (Math.hypot(offsetX, offsetY) < 4) return
    draggingIndex.value = pressingIndex.value
    hoverIndex.value = pressingIndex.value
  }

  const element = document.elementFromPoint(event.clientX, event.clientY)
  const tag = element?.closest<HTMLElement>('[data-tag-index]')
  const nextHoverIndex = tag ? Number(tag.dataset.tagIndex) : null

  if (nextHoverIndex !== hoverIndex.value) {
    hoverIndex.value = nextHoverIndex
  }
}

function handlePointerUp(index: number, event: PointerEvent) {
  if (pressingIndex.value === null) return

  if (draggingIndex.value !== null) {
    handlePointerMove(event)
  }
  const sourceIndex = draggingIndex.value
  const targetIndex = hoverIndex.value ?? index

  if (sourceIndex !== null && sourceIndex !== targetIndex) {
    const nextList = [...list.value]
    const [moved] = nextList.splice(sourceIndex, 1)
    nextList.splice(targetIndex, 0, moved)
    list.value = nextList
    updateModel()
  }

  pressingIndex.value = null
  draggingIndex.value = null
  hoverIndex.value = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

function handlePointerCancel() {
  pressingIndex.value = null
  draggingIndex.value = null
  hoverIndex.value = null
}

function isInsertBefore(index: number) {
  return draggingIndex.value !== null && hoverIndex.value === index && draggingIndex.value > index
}

function isInsertAfter(index: number) {
  return draggingIndex.value !== null && hoverIndex.value === index && draggingIndex.value < index
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTags()
  } else if (e.key === 'Backspace' && !inputValue.value && list.value.length > 0) {
    removeTag(list.value.length - 1)
  }
}
</script>

<template>
  <div class="draggable-input-tag">
    <div class="tag-list">
      <span
          v-for="(element, index) in list"
          :key="element.id"
          class="draggable-tag-wrapper"
          :data-tag-index="index"
          :class="{
            'is-dragging': draggingIndex === index,
            'insert-before': isInsertBefore(index),
            'insert-after': isInsertAfter(index),
          }"
          @pointerdown="handlePointerDown(index, $event)"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp(index, $event)"
          @pointercancel="handlePointerCancel"
      >
        <el-tag
            closable
            :effect="tagEffect"
            :type="tagType"
            class="draggable-tag"
            @close="removeTag(index)"
        >
          {{ element.value }}
        </el-tag>
      </span>
    </div>
    <el-input
        v-model="inputValue"
        :size="size"
        class="tag-input"
        placeholder="Press Enter to add"
        @keydown="handleKeydown"
        @blur="addTags"
    >
      <template v-if="clearable" #suffix>
        <el-icon class="clear-icon" @click="clearAll">
          <Delete/>
        </el-icon>
      </template>
    </el-input>
  </div>
</template>

<style scoped>
.draggable-input-tag {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 4px 8px;
  background-color: var(--el-fill-color-blank);
  flex-grow: 1;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.draggable-tag-wrapper {
  position: relative;
  display: inline-flex;
  cursor: move;
  user-select: none;
  touch-action: none;
}

.draggable-tag-wrapper.is-dragging {
  opacity: 0.6;
}

.draggable-tag-wrapper.insert-before::before,
.draggable-tag-wrapper.insert-after::after {
  content: '';
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  border-radius: 1px;
  background-color: var(--el-color-primary);
  pointer-events: none;
}

.draggable-tag-wrapper.insert-before::before {
  left: -4px;
}

.draggable-tag-wrapper.insert-after::after {
  right: -4px;
}

.draggable-tag {
  cursor: move;
  user-select: none;
}

.tag-input {
  flex: 1 1 auto;
  min-width: 80px;
}

.tag-input :deep(.el-input__inner) {
  border: none;
  box-shadow: none !important;
  padding: 0;
  background: transparent;
}

.tag-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  padding: 0;
  background: transparent;
}

.clear-icon {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}

.clear-icon:hover {
  color: var(--el-color-danger);
}
</style>
