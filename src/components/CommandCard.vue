<script lang="ts" setup>
import {Delete, Plus} from "@element-plus/icons-vue";
import {handleClose, processTemplates} from "../utils.ts";
import {defineProps, onBeforeUnmount, PropType, ref} from "vue";
import {Command} from "../types/command.ts";
import ColoredImage from "./ColoredImage.vue";
import {Version} from "../types/version.ts";

const emit = defineEmits<{
  addImg: [uuid: string, index: number],
  delImg: [uuid: string, index: number],
  pushImg: [uuid: string, index: number]
}>()

const props = defineProps({
  promptObject: {
    type: Object as PropType<Version | Command>,
  },
  nsfw: {
    type: Boolean
  },
  rate: {
    type: Number
  }
})

const hover = ref({
  isHolding: false,
  timeOut: null,
  load: () => {
    if (hover.value.timeOut)
      clearTimeout(hover.value.timeOut)

    hover.value.timeOut = setTimeout(() => {
      hover.value.isHolding = true
      hover.value.timeOut = null
    }, 300)
  },
  cancel: () => {
    if (hover.value.timeOut)
      clearTimeout(hover.value.timeOut)
    hover.value.isHolding = false
  }
})

const deleteImg = async () => {
  const index = carousel.value.activeIndex
  if (props.promptObject.imgs.length > 1) {
    if (index == props.promptObject.imgs.length - 1) // 最后一个元素
      carousel.value.setActiveItem(index - 1)
  }
  emit('delImg', props.promptObject.uuid, index)
}

const carousel = ref()
const manualSwitchLocked = ref(false)
let manualSwitchTimer: ReturnType<typeof setTimeout> | null = null

const lockManualSwitch = () => {
  manualSwitchLocked.value = true
  if (manualSwitchTimer) clearTimeout(manualSwitchTimer)
  manualSwitchTimer = setTimeout(() => {
    manualSwitchLocked.value = false
    manualSwitchTimer = null
  }, 350)
}

const handleCarouselClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const control = target.closest('.el-carousel__arrow, .el-carousel__indicator')
  if (!control) return

  if (manualSwitchLocked.value) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }

  lockManualSwitch()
}

onBeforeUnmount(() => {
  if (manualSwitchTimer) clearTimeout(manualSwitchTimer)
})
</script>

<template>
  <el-card :class="{'card':true,'nsfw':!props.nsfw&&(promptObject.rate > rate), 'hover':hover.isHolding}"
           @mouseleave="hover.cancel"
           @mouseover="hover.load">
    <template #header>
      <slot name="header"/>
    </template>
    <el-carousel v-if="promptObject.showImg" ref="carousel" :autoplay="false" :loop="false"
                 height="300px" @click.capture="handleCarouselClick">
      <el-carousel-item v-for="(img, index) in promptObject.imgs" :key="img">
        <colored-image :img="img" :contain-size="512" :lazy="false"/>
      </el-carousel-item>
      <el-carousel-item v-if="promptObject.imgs.length === 0"
                        style="display: flex; justify-content: center; align-items: center;"
                        @click="emit('addImg', promptObject.uuid, carousel.activeIndex)">
        <el-icon>
          <Plus/>
        </el-icon>
      </el-carousel-item>
      <el-col v-else>
        <el-button :icon="Plus" class="push-img" type="primary" @click="emit('pushImg', promptObject.uuid, carousel.activeIndex)"/>
        <el-button :icon="Plus" class="add-img" type="primary" @click="emit('addImg', promptObject.uuid, carousel.activeIndex)"/>
        <el-button :icon="Delete"
                   class="del-img"
                   type="danger"
                   @click="handleClose(()=>deleteImg(), 'Are you sure to delete this image?')"/>
      </el-col>
    </el-carousel>
    <el-col v-if="promptObject.unfolding" style="margin-top: 10px;">
      <el-text v-html="processTemplates(promptObject.words)"/>
      <el-divider v-if="promptObject.words?.length != 0 && promptObject.dewords?.length != 0"/>
      <el-text type="info" v-html="processTemplates(promptObject.dewords)"/>
    </el-col>
    <template #footer>
      <slot name="footer"/>
    </template>
  </el-card>
</template>

<style scoped>
.nsfw:not(.hover) > :is(div.el-card__header, div.el-card__body, div.el-card__footer) {
  filter: contrast(0);
  color: transparent;
}

.nsfw > :is(div.el-card__header, div.el-card__body, div.el-card__footer) {
  transition: filter 0.6s ease, color 0.6s ease;
}

.nsfw:not(.hover) > :deep(div.el-card__body) :is(span, ruby, rt) {
  color: transparent;
}

.nsfw > :deep(div.el-card__body) :is(span, ruby, rt) {
  transition: color 0.6s ease;
}

:deep(ul.el-carousel__indicators):has( > li:only-of-type) > li {
  display: none;
}

.el-carousel:has(li:only-of-type) > :deep(button.el-carousel__arrow) {
  display: none;
}

.add-img {
  position: absolute;
  right: 0;
  top: 0;
  border-radius: 5px 0 5px 100%;
  z-index: 5;
}

.add-img > :deep(i) {
  position: absolute;
  right: 20.7%;
  top: 20.7%;
}

.push-img {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 0 5px 100% 5px;
  z-index: 5;
}

.push-img > :deep(i) {
  position: absolute;
  left: 20.7%;
  top: 20.7%;
}

.del-img {
  position: absolute;
  right: 0;
  bottom: 0;
  border-radius: 100% 5px 0 5px;
  z-index: 5;
}

.del-img > :deep(i) {
  position: absolute;
  right: 20.7%;
  bottom: 20.7%;
}

.el-card > :deep(.el-card__footer) {
  display: grid;
}

.el-card > :deep(.el-card__footer) > .el-col {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.el-carousel {
  position: relative;
}

.el-carousel:not(:first-child) {
  margin-top: 6px;
}

.el-carousel > :deep(.el-carousel__container) {
  border-radius: 10px;
  border: 1px dashed var(--el-border-color);
  overflow: hidden;
}

:deep(.el-carousel__button) {
  --el-carousel-indicator-height: 6px;
  --el-carousel-indicator-width: 12px;
  border-radius: 3px;
}

:deep(.card-header) > span:nth-child(1) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

:deep(.card-header) > span:nth-child(1) > span:nth-child(2) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 50px;
}
</style>

<style>
.el-card__header:has(+ .el-card__body:empty) {
  border-bottom: none;
}

.el-card__body:empty {
  display: none;
}

/*.el-carousel::after {
  content: '';
  background-image: linear-gradient(to top, #00000088, #00000011 30px, transparent 40px);
  position: absolute;
  border-radius: 10px;
  bottom: 1px;
  left: 1px;
  width: calc(100% - 2px);
  height: 40px;
}*/

.el-carousel__indicators.el-carousel__indicators--horizontal {
  line-height: 0;
  bottom: 8px;
  transform: none;
  left: 0;
  width: 80%;
  text-align: center;
  padding: 0 10%;
}

.el-carousel__indicators.el-carousel__indicators--horizontal::after {
  content: '';
  background-image: linear-gradient(to top, #00000099, #00000011 75%, transparent);
  position: absolute;
  border-radius: 0 0 10px 10px;
  bottom: -7px;
  left: 1px;
  width: 100%;
  height: max(calc(100% + 15px), 30px);
  z-index: -1;
  pointer-events: none;
}

.el-carousel__indicator--horizontal {
  --el-carousel-indicator-padding-vertical: 4px;
}

.el-carousel__indicator:hover button {
  transition: opacity 0s;
}

.el-carousel__indicator button {
  transition: opacity 1s ease-in;
}
</style>