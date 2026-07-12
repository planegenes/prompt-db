<script lang="ts" setup>
import {convertFileSrc} from "@tauri-apps/api/core";
import {nextTick, onMounted, ref} from "vue";
import {getImageSize, getResizedImage, messageWithEl} from "../utils.ts";
import autohue from 'autohue.js'
import {ElImage} from "element-plus";
import {CopyDocument} from "@element-plus/icons-vue";
import {path} from "@tauri-apps/api";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";

const props = defineProps({
  img: {
    type: String
  },
  /**
   * 预览图的目标尺寸（contain 模式：长边对齐该尺寸）。
   * 预览图区域尺寸固定，因此直接写死传入即可。
   */
  containSize: {
    type: Number,
    default: 512
  }
})

// 预览图（缩略图）
const previewSrc = ref("")
const previewUrl = ref("")
// 原图（仅在弹窗显示时加载）
const origSrc = ref("")

const element = ref()
const width = ref(1)
const height = ref(1)
let picW = 0
let picH = 0
const style = ref({
  backgroundImage: ""
})

const loadBackground = () => {
  if (picW && style.value.backgroundImage.length === 0 && previewSrc.value.length > 0) {
    autohue(previewSrc.value, {
      threshold: 5,
      maxSize: 50
    })
        .then((result) => {
          try {
            if ((width.value / height.value) > (picW / picH)) {
              style.value.backgroundImage = `linear-gradient(0.25turn, ${result.backgroundColor.left} 0 50%, ${result.backgroundColor.right} 50%)`
            } else {
              style.value.backgroundImage = `linear-gradient(${result.backgroundColor.top} 0 50%, ${result.backgroundColor.bottom} 50%)`
            }
          } catch (error) {
            console.error(error)
          }
        })
        .catch((err) => console.error(err))
  }
}

const setWH = () => {
  if (picW) return

  getImageSize(props.img).then((v) => {
    ({width: picW, height: picH} = {...v})
    loadBackground()
  })
}

// 预览图直接加载，不等待、不 progressive
const loadPreview = async () => {
  if (previewSrc.value.length > 0) return

  try {
    const resizedPath = await getResizedImage(props.img, props.containSize, 'contain')
    previewSrc.value = convertFileSrc(resizedPath)
  } catch (error) {
    console.error('预览图生成失败，回退到原图:', error)
    previewSrc.value = convertFileSrc(props.img)
  }

  previewUrl.value = `url(${previewSrc.value})`
  setWH()
}

// 原图只在弹窗显示时加载
const loadOrig = () => {
  if (origSrc.value.length === 0)
    origSrc.value = convertFileSrc(props.img)
}

const showImage = ref({
  show: false,
  fileName: await path.basename(props.img),
  start: () => {
    loadOrig()
    showImage.value.show = true
  }
})

onMounted(() => {
  nextTick(() => {
    [width.value, height.value] = [element.value.$el.clientWidth, element.value.$el.clientHeight]
    loadPreview()
  })
})
</script>

<template>
  <el-col ref="element" :style="style" style="width: 100%; height: 100%;">
    <el-image :alt="props.img" :src="previewSrc" fit="scale-down" lazy style="z-index: 1;" @click="showImage.start">
      <template #error>
        <div class="image-error-slot"/>
      </template>
    </el-image>
  </el-col>
  <el-dialog v-model="showImage.show" align-center append-to-body width="auto">
    <template #title>
      <el-button :icon="CopyDocument" style="margin-right: 5px;" text
                 type="info" @click="messageWithEl(props.img, 'success', ()=>writeText(props.img))"/>
      <el-text size="large" type="info">
        {{ showImage.fileName }}
      </el-text>
    </template>
    <img v-if="showImage.show" id="show-img" :alt="props.img" :src="origSrc"/>
  </el-dialog>
</template>

<style scoped>
#show-img {
  object-fit: scale-down;
  max-height: 80vh;
  max-width: 80vw;
  width: 100%;
  height: 100%;
  border-radius: var(--el-dialog-border-radius);
}

.el-image {
  width: 100%;
  height: 100%;
}

.image-error-slot {
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color-light);
}

.el-col::after {
  content: "";
  background-image: v-bind(previewUrl);
  background-position: center;
  background-size: contain;
  position: absolute;
  width: 102%;
  height: 102%;
  display: block;
  top: -1%;
  left: -1%;
  background-repeat: no-repeat;
  filter: blur(40px);
  transform: translateZ(0);
}
</style>
