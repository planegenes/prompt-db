<script lang="ts" setup>
import {
  ArrowDown,
  ArrowRight,
  Check,
  Close,
  CopyDocument,
  Delete,
  Edit,
  Hide,
  Refresh,
  View
} from "@element-plus/icons-vue"
import {computed, getCurrentInstance, inject, nextTick, PropType, Ref, ref, useTemplateRef, useId} from "vue";
import {db} from "../database";
import {Templater} from "../types/templater.ts";
import {ElMessage, ElMessageBox, ElSelect} from 'element-plus'
import ModelCard from "../components/ModelCard.vue";
import {getResizedImage, handleClose, messageWithEl, processTemplatesPlain} from "../utils.ts";
import {open} from "@tauri-apps/plugin-dialog";
import {platform} from "@tauri-apps/plugin-os";
import {path} from "@tauri-apps/api";
import CommandCard from "../components/CommandCard.vue";
import {useNSFWStore} from '../store/nsfwStore.ts';
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import {Version} from "../types/version.ts";
import {Model} from "../types/model.ts";
import {convertFileSrc} from "@tauri-apps/api/core";
import ModelSlider from "./ModelSlider.vue";

const nsfwStore = useNSFWStore()

const props = defineProps({
  templater: {
    type: Object as PropType<Templater>
  }
})

const models = inject<Ref<Model[]>>('models')

const versions = computed(() => props.templater.versions.map(v => v.title))

const currentIndex = ref(0)

const hoverIndex = ref(-1)

// 版本 tag hover 缩略图缓存
const hoverThumbMap = ref(new Map<number, string>())
// 缩略图容器目标尺寸，用于宽高变化动画
const thumbSizeMap = ref(new Map<number, { width: number; height: number }>())

const onThumbLoad = (index: number, e: Event) => {
  const img = e.target as HTMLImageElement
  thumbSizeMap.value.set(index, {
    width: img.naturalWidth,
    height: img.naturalHeight,
  })
}

const getThumbSizeStyle = (index: number) => {
  const size = thumbSizeMap.value.get(index)
  if (size) {
    return { width: `${size.width}px`, height: `${size.height}px` }
  }
  return { width: '200px', height: '200px' }
}

const loadHoverThumb = async (index: number) => {
  if (hoverThumbMap.value.has(index)) return

  const imgs = props.templater.versions[index]?.imgs
  if (!imgs || imgs.length === 0) return

  const path = imgs[0]
  try {
    // cover 模式：短边对齐 200px，填满 200×200 的显示区域
    const thumb = await getResizedImage(path, 200, 'cover')
    hoverThumbMap.value.set(index, convertFileSrc(thumb))
  } catch (e) {
    hoverThumbMap.value.set(index, convertFileSrc(path))
  }
}

const editTitle = ref({
  enabled: false,
  start: () => {
    editTitle.value.enabled = true
  },
  finish: () => {
    updateTemplater()
    editTitle.value.enabled = false
  }
})

const newVersion = () => {
  ElMessageBox.prompt('Please input name', 'Tip', {
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    inputPattern:
        /^.+$/,
    inputErrorMessage: "Can't be Empty",
  })
      .then(({value}) => {
        ElMessage({
          type: 'success',
          message: `Name is: ${value}`,
        })
        const newValue = new Version(value)
        props.templater.versions.push(newValue)
        updateTemplater()
      })
      .catch((e) => {
        ElMessage({
          type: 'info',
          message: 'Input canceled',
        })
        console.error(e)
      })
}

const editeVersion = ref({
  show: false,
  version: {} as Version,
  editingTitle: false,
  start: (value: Version) => {
    editeVersion.value.version = JSON.parse(JSON.stringify(value))
    editeVersion.value.show = true
  },
  finish: async () => {
    props.templater.versions[currentIndex.value] = editeVersion.value.version
    await updateTemplater()
    editeVersion.value.show = false
  }
})

const deleteTemplater = async () => {
  await db.templaters.delete(props.templater.uuid)
}

const copyTemplater = async () => {
  const value = props.templater
  let newValue = new Templater()
  let {uuid: _uuid, date: _date, ...changes} = value
  changes.title = `${value.title}_副本_${new Date(newValue.date).toLocaleDateString()}`
  changes.versions[0].imgs = []
  changes.versions.splice(1)
  Object.assign(newValue, changes)
  await db.templaters.add(JSON.parse(JSON.stringify(newValue)))
}
const updateTemplater = async () => {
  await db.templaters.update(props.templater.uuid, JSON.parse(JSON.stringify(props.templater)))
}

const deleteVersion = async (index: number = currentIndex.value) => {
  try {
    if (props.templater.versions.length === 1) {
      props.templater.versions = [new Version()]
      await updateTemplater()
    } else if (index === 0) {
      currentIndex.value = Math.min(currentIndex.value, props.templater.versions.length - 2)
      props.templater.versions.splice(0, 1)
      await updateTemplater()
    } else {
      currentIndex.value = Math.min(currentIndex.value, props.templater.versions.length - 2)
      props.templater.versions.splice(index, 1)
      await updateTemplater()
    }
  } catch (e) {
    console.error(e)
  } finally {
    try {
      getCurrentInstance()?.proxy?.$forceUpdate()
    } catch (e) {
    }
  }
}

const updateVersion = async (newValue: any) => {
  Object.assign(props.templater.versions[currentIndex.value], newValue)
  await updateTemplater()
}

const setBaseModel = ref({
  show: false,
  model: {
    uuid: "",
    version: ""
  },
  focusInput: useTemplateRef('base_model_input'),
  start: (model: { uuid: string, version: string } | null) => {
    setBaseModel.value.model.uuid = model?.uuid ?? ""
    setBaseModel.value.model.version = model?.version ?? ""
    setBaseModel.value.show = true
  },
  finish: () => {
    editeVersion.value.version.base_model = {...setBaseModel.value.model}
    setBaseModel.value.show = false
  }
})

const addModel = ref({
  show: false,
  type: 0,
  model: {
    uuid: "",
    version: ""
  },
  focusInput: useTemplateRef('add_model_input'),
  start: (type: number) => {
    addModel.value.type = type
    addModel.value.model = {uuid: "", version: ""}
    addModel.value.show = true
  },
  finish: () => {
    if (!editeVersion.value.version[addModel.value.type === 1 ? "lora_models" : "embedding_models"]
        .find(v => v.uuid == addModel.value.model.uuid))
      editeVersion.value.version[addModel.value.type === 1 ? "lora_models" : "embedding_models"]
          .push({...addModel.value.model, weight: 0.8})
    addModel.value.show = false
  }
})

const addAdetailer = ref({
  show: false,
  model: {
    uuid: "",
    version: ""
  },
  focusInput: useTemplateRef('add_adetailer_input'),
  start: () => {
    addAdetailer.value.model = {uuid: "", version: ""}
    addAdetailer.value.show = true
  },
  finish: () => {
    if (!editeVersion.value.version.adetailer_lora.find(v => v.uuid == addAdetailer.value.model.uuid))
      editeVersion.value.version.adetailer_lora.push({
        ...addAdetailer.value.model,
        weight: 0.8
      })
    addAdetailer.value.show = false
  }
})

const replaceModel = ref({
  show: false,
  model: {
    uuid: "",
    version: ""
  },
  focusInput: useTemplateRef('replace_model_input'),
  models: [],
  fun: null,
  start: () => {
    replaceModel.value.model = {uuid: "", version: ""}
    replaceModel.value.show = true
  },
  startL: (fun: (v) => {}) => {
    replaceModel.value.fun = fun
    replaceModel.value.models = models.value.filter(v => v?.type == 1)
    replaceModel.value.start()
  },
  startE: (fun: (v) => {}) => {
    replaceModel.value.fun = fun
    replaceModel.value.models = models.value.filter(v => v?.type == 2)
    replaceModel.value.start()
  },
  finish: () => {
    replaceModel.value.fun(replaceModel.value.model)
    replaceModel.value.show = false
  }
})

const copyVersion = async () => {
  const value = props.templater.versions[currentIndex.value]
  let newValue = new Version()
  let {uuid: _uuid, date: _date, imgs: _imgs, ...changes} = value
  changes.title = `${value.title}_副本_${new Date(newValue.date).toLocaleDateString()}`
  Object.assign(newValue, changes)
  props.templater.versions.splice(currentIndex.value+1, 0, newValue)
  await updateTemplater()
}

const showWords = ref()
const showDewords = ref()
const showAdWords = ref()
const showAdDewords = ref()

const showVersion = ref({
  show: false,
  version: new Version(),
  start: (value: Version) => {
    showVersion.value.version = JSON.parse(JSON.stringify(value))
    showVersion.value.version.words = processTemplatesPlain(showVersion.value.version.words)
    showVersion.value.version.dewords = processTemplatesPlain(showVersion.value.version.dewords)
    showVersion.value.version.adetailer_words = processTemplatesPlain(showVersion.value.version.adetailer_words)
    showVersion.value.version.adetailer_dewords = processTemplatesPlain(showVersion.value.version.adetailer_dewords)
    nextTick(() => {
      showWords.value?.resizeTextarea()
      showDewords.value?.resizeTextarea()
      showAdWords.value?.resizeTextarea()
      showAdDewords.value?.resizeTextarea()
    })
    showVersion.value.show = true
  }
})

const addImg = async (version_uuid: string, index: number) => {
  try {
    const files: string[] = await open({
      multiple: true,
      filters: [{
        name: '图片', extensions: [
          'jpg', 'jpeg', 'png', 'webp', 'bmp'
        ]
      }]
    });
    if (!files || files.length === 0) return;
    let version = props.templater.versions.find(v => v.uuid == version_uuid)
    for (const file of files) {
      let normalized: string
      if (platform() !== "android" && platform() !== "ios") {
        normalized = (await path.normalize(file)).replace(/\\/gi, "/");
      } else {
        normalized = file
      }
      if (version.imgs.includes(normalized)) {
        ElMessage('图片已存在：' + normalized);
        continue;
      }
      version.imgs.splice(++index, 0, normalized)
    }
    props.templater.versions[currentIndex.value] = version
    await db.templaters.update(props.templater.uuid, JSON.parse(JSON.stringify(props.templater)))
  } catch (error) {
    ElMessage('图片添加失败:' + error);
  }
}
const pushImg = async (version_uuid: string, index: number) => {
  try {
    const files: string[] = await open({
      multiple: true,
      filters: [{
        name: '图片', extensions: [
          'jpg', 'jpeg', 'png', 'webp', 'bmp'
        ]
      }]
    });
    if (!files || files.length === 0) return;
    let version = props.templater.versions.find(v => v.uuid == version_uuid)
    for (const file of files) {
      let normalized: string
      if (platform() !== "android" && platform() !== "ios") {
        normalized = (await path.normalize(file)).replace(/\\/gi, "/");
      } else {
        normalized = file
      }
      if (version.imgs.includes(normalized)) {
        ElMessage('图片已存在：' + normalized);
        continue;
      }
      version.imgs.splice(index++, 0, normalized)
    }
    props.templater.versions[currentIndex.value] = version
    await db.templaters.update(props.templater.uuid, JSON.parse(JSON.stringify(props.templater)))
  } catch (error) {
    ElMessage('图片添加失败:' + error);
  }
}

const delImg = async (version_uuid: string, index: number) => {
  const version = props.templater.versions.find(v => v.uuid == version_uuid)
  version.imgs.splice(index, 1)
  props.templater.versions[currentIndex.value] = version
  await db.templaters.update(props.templater.uuid, JSON.parse(JSON.stringify(props.templater)))
}

const whatIsMyWidth = (size: string, width: number) => {
  switch (size) {
    case 'Portrait':
      return 768;
    case 'Landscape':
      return 1152;
    case 'Square':
      return 1024;
    default:
      return width;
  }
}

const whatIsMyHeight = (size: string, height: number) => {
  switch (size) {
    case 'Portrait':
      return 1152;
    case 'Landscape':
      return 768;
    case 'Square':
      return 1024;
    default:
      return height;
  }
}
</script>

<template>
  <command-card :nsfw="nsfwStore.enable" :prompt-object="templater.versions[currentIndex] || new Version('cnmyyx')" :rate="nsfwStore.rate"
                @add-img="addImg" @del-img="delImg" @push-img="pushImg">
    <template #header>
      <div class="card-header">
          <span>
            <el-button :icon="templater.versions[currentIndex].unfolding?ArrowDown:ArrowRight"
                       circle size="small"
                       @click="updateVersion({unfolding: !templater.versions[currentIndex].unfolding})"/>
            <el-input v-if="editTitle.enabled || (!templater.title)" v-model="templater.title"
                      clearable @change="editTitle.finish" @focusout="editTitle.finish"/>
            <span v-else @dblclick="editTitle.start">{{ templater.title }}</span>
          </span>
        <span>
            <el-button :icon="CopyDocument" circle size="small" type="success" @click="copyTemplater"/>
            <el-button :icon="Delete" circle size="small" type="danger"
                       @click="handleClose(()=>deleteTemplater(), 'Are you sure to delete this templater?')"/>
          </span>
      </div>
      <div class="views">
        <el-popover v-for="(tag, index) in versions" :key="tag"
                    :disabled="templater.versions[index].imgs.length === 0 || index===currentIndex"
                    width="auto"
                    placement="bottom"
                    trigger="hover"
                    @show="loadHoverThumb(index)">
          <template #reference>
            <el-tag :checked="index===currentIndex"
                    :effect="index===hoverIndex?'dark':index===currentIndex?'light':'plain'"
                    closable
                    style="cursor: pointer;" @click="currentIndex=index"
                    @close="handleClose(()=>deleteVersion(index), 'Are you sure to delete this version?')"
                    @mouseleave="hoverIndex=-1"
                    @mouseover="hoverIndex=index">{{ tag }}
            </el-tag>
          </template>
          <div
              v-if="templater.versions[index].imgs.length"
              class="thumb-wrapper"
              :style="getThumbSizeStyle(index)">
            <el-image
                v-if="hoverThumbMap.has(index)"
                class="thumb-fade"
                fit="cover"
                :alt="templater.versions[index].imgs[0]"
                :src="hoverThumbMap.get(index)"
                @load="onThumbLoad(index, $event)"
                :style="{filter: nsfwStore.enable || (templater.versions[index].rate <= nsfwStore.rate) ? 'none': 'contrast(0)'}"/>
            <div
                v-else
                class="thumb-loading">
              <span class="thumb-loading-text">Loading...</span>
            </div>
          </div>
        </el-popover>
        <el-button class="button-new-tag" size="small" @click="newVersion">
          + New Tag
        </el-button>
      </div>
      <div style="display: flex; justify-content: center; gap: 1px;">
        <el-button :icon="View" class="version-control left-control" size="small" type="info"
                   @click="showVersion.start(templater.versions[currentIndex])"/>
        <el-button :icon="Edit" class="version-control" size="small" type="primary"
                   @click="editeVersion.start(templater.versions[currentIndex])"/>
        <el-button :icon="Delete" class="version-control" size="small" type="danger"
                   @click="handleClose(()=>deleteVersion(), 'Are you sure to delete this version?')"/>
        <el-button :icon="CopyDocument" class="version-control right-control" size="small" type="success"
                   @click="copyVersion"/>
      </div>
    </template>
    <template #footer>
      <el-col>
        <el-input-tag v-model="templater.versions[currentIndex].tags" tag-effect="dark" tag-type="primary"
                      @change="updateTemplater"/>
      </el-col>
      <el-col>
        <el-switch v-model="templater.versions[currentIndex].showImg" :active-action-icon="View"
                   :inactive-action-icon="Hide"
                   @change="updateTemplater"/>
        <el-rate v-model="templater.versions[currentIndex].rate" :colors="['#4CAF50','#FF9800','#C62828']" clearable
                 size="large" @change="updateTemplater"/>
      </el-col>
    </template>
  </command-card>
  <el-dialog
      v-if="editeVersion.show"
      v-model="editeVersion.show"
      :before-close="handleClose"
      preset="card"
      style="width: 80%; margin: 10% auto"
  >
    <template #header>
      <el-input v-if="editeVersion.editingTitle || (!editeVersion.version.title)"
                v-model="editeVersion.version.title"
                clearable @change="editeVersion.editingTitle = false"/>
      <el-text v-else size="large" @dblclick="editeVersion.editingTitle = true">
        {{ editeVersion.version.title }}
      </el-text>
    </template>
    <el-form :model="editeVersion.version">
      <el-card shadow="always">
        <el-row>
          <el-text size="large">提示词</el-text>
        </el-row>
        <el-input v-model="editeVersion.version.words" :rows="8" type="textarea"/>
        <el-divider/>
        <el-row>
          <el-text size="large">逆向提示词</el-text>
        </el-row>
        <el-input v-model="editeVersion.version.dewords" :rows="4" type="textarea"/>
        <el-col style="display: flex; justify-content: right;">
          <el-checkbox v-model="editeVersion.version.a1111" label="A1111" size="large"/>
          <el-checkbox v-model="editeVersion.version.ella" label="Ella" size="large"/>
        </el-col>
      </el-card>
      <el-card shadow="always">
        <el-col class="space-between">
          <el-text size="large" tag="b">模型</el-text>
          <el-button :icon="Edit" type="primary" @click="setBaseModel.start(editeVersion.version.base_model)"/>
        </el-col>
        <el-row class="models">
          <model-card v-if="editeVersion.version?.base_model?.uuid"
                      :model-uuid="editeVersion.version.base_model.uuid"
                      :model-version="editeVersion.version.base_model.version" hide-footer/>
          <el-card v-else shadow="always" @click="setBaseModel.start(editeVersion.version.base_model)">
            <template #header>
              <el-text size="large">选择基础模型</el-text>
            </template>
            <span class="hide"/>
          </el-card>
          <el-col class="space-between">
            <el-col></el-col>
            <el-col>
              <el-checkbox v-model="editeVersion.version.sdxl_refiner" label="SDXL Refiner"/>
            </el-col>
          </el-col>
          <model-card v-for="(model, index) in editeVersion.version.lora_models" :key="model.uuid"
                      :model-uuid="model.uuid" :model-version="model.version">
            <el-button :icon="Refresh" type="success"
                       @click="replaceModel.startL((v)=>editeVersion.version.lora_models[index]=v)"/>
            <el-button :icon="Delete" type="danger" @click="editeVersion.version.lora_models.splice(index,1)"/>
            <model-slider v-model="model.weight"/>
          </model-card>
          <model-card v-for="(model, index) in editeVersion.version.embedding_models" :key="model.uuid"
                      :model-uuid="model.uuid" :model-version="model.version">
            <el-button :icon="Refresh" type="success"
                       @click="replaceModel.startE((v)=>editeVersion.version.embedding_models[index]=v)"/>
            <el-button :icon="Delete" type="danger"
                       @click="editeVersion.version.embedding_models.splice(index,1)"/>
            <model-slider v-model="model.weight"/>
          </model-card>
        </el-row>
        <el-row :gutter="32">
          <el-col :span="12">
            <el-button class="full-width" type="primary" @click="addModel.start(1)">添加 LoRA(风格)</el-button>
          </el-col>
          <el-col :span="12">
            <el-button class="full-width" type="primary" @click="addModel.start(2)">添加 Embedding</el-button>
          </el-col>
        </el-row>
        <el-row>
          <el-text size="large">VAE</el-text>
        </el-row>
        <el-select v-model="editeVersion.version.vae">
          <el-option value="Automatic"/>
          <el-option value="sdxl_vae.safetensors"/>
          <el-option value="sdxl-vae-fp16-fix.safetensors"/>
        </el-select>
      </el-card>
      <el-card>
        <el-row>
          <el-text size="large" tag="b">设置</el-text>
        </el-row>
        <el-row>
          <el-text size="large">图片大小</el-text>
        </el-row>
        <el-radio-group v-model="editeVersion.version.size">
          <el-radio-button label="Portrait" value="Portrait"/>
          <el-radio-button label="Landscape" value="Landscape"/>
          <el-radio-button label="Square" value="Square"/>
          <el-radio-button label="custom" value="custom"/>
        </el-radio-group>
        <el-col v-if="editeVersion.version.size === 'custom'">
          <el-row :gutter="32">
            <el-col :span="11">
              <el-text size="large">宽</el-text>
            </el-col>
            <el-col :span="12">
              <el-text size="large">高</el-text>
            </el-col>
          </el-row>
          <el-row :gutter="32">
            <el-col style="position: absolute; left:50%; transform: translate(-50%, 0%);">
              <el-button @click="[editeVersion.version.width, editeVersion.version.height] = [editeVersion.version.height, editeVersion.version.width]" text circle :icon="Refresh"/>
            </el-col>
            <el-col :span="12">
              <el-slider v-model="editeVersion.version.width" :max="5060" :min="128" show-input/>
            </el-col>
            <el-col :span="12">
              <el-slider v-model="editeVersion.version.height" :max="5060" :min="128" show-input/>
            </el-col>
          </el-row>
        </el-col>
        <div class="space-between">
          <el-text size="large">采样算法(Sampler)</el-text>
          <el-switch v-model="editeVersion.version.senior" active-text="高级"/>
        </div>
        <el-row v-if="!editeVersion.version.senior">
          <el-select v-model="editeVersion.version.algorithm" filterable>
            <el-option value="Euler a"/>
            <el-option value="Euler"/>
            <el-option value="LMS"/>
            <el-option value="LMS Karras"/>
            <el-option value="DDIM"/>
            <el-option value="LCM"/>
            <el-option value="Heun"/>
            <el-option value="DPM fast"/>
            <el-option value="DPM2"/>
            <el-option value="DPM2 a"/>
            <el-option value="DPM2 Karras"/>
            <el-option value="DPM2 a Karras"/>
            <el-option value="DPM++ 2S a"/>
            <el-option value="DPM++ 2M"/>
            <el-option value="DPM++ SDE"/>
            <el-option value="DPM++ 2S a Karras"/>
            <el-option value="DPM++ 2M Karras"/>
            <el-option value="Restart"/>
            <el-option value="DPM++ 2M SDE Exponential"/>
            <el-option value="DPM++ 2M SDE Heun"/>
            <el-option value="DPM++ 2M SDE Heun Karras"/>
            <el-option value="DPM++ 2M SDE Heun Exponential"/>
            <el-option value="DPM++ 3M SDE"/>
            <el-option value="DPM++ 3M SDE Karras"/>
            <el-option value="DPM++ 3M SDE Exponential"/>
            <el-option value="euler_dy"/>
            <el-option value="euler_smea_dy"/>
          </el-select>
        </el-row>
        <el-col v-else>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-text size="large">采样器</el-text>
            </el-col>
            <el-col :span="12">
              <el-text size="large">调度器</el-text>
            </el-col>
          </el-row>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-select v-model="editeVersion.version.sampler" filterable>
                <el-option value="euler"/>
                <el-option value="euler_ancestral"/>
                <el-option value="heun"/>
                <el-option value="heunpp2"/>
                <el-option value="dpm_2"/>
                <el-option value="dpm_2_ancestral"/>
                <el-option value="lms"/>
                <el-option value="dpm_fast"/>
                <el-option value="dpm_adaptive"/>
                <el-option value="dpmpp_2s_ancestral"/>
                <el-option value="dpmpp_sde_gpu"/>
                <el-option value="dpmpp_2m"/>
                <el-option value="dpmpp_2m_sde_gpu"/>
                <el-option value="dpmpp_3m_sde_gpu"/>
                <el-option value="ddpm"/>
                <el-option value="lcm"/>
                <el-option value="restart"/>
                <el-option value="euler_dy"/>
                <el-option value="euler_smea_dy"/>
                <el-option value="ddim"/>
                <el-option value="uni_pc"/>
                <el-option value="uni_pc_bh2"/>
                <el-option value="res_multistep"/>
              </el-select>
            </el-col>
            <el-col :span="12">
              <el-select v-model="editeVersion.version.scheduler">
                <el-option value="normal"/>
                <el-option value="karras"/>
                <el-option value="sgm_uniform"/>
                <el-option value="exponential"/>
                <el-option value="simple"/>
                <el-option value="ddim_uniform"/>
                <el-option value="beta"/>
                <el-option value="linear_quadratic"/>
              </el-select>
            </el-col>
          </el-row>
        </el-col>
        <el-col>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-text size="large">采样次数</el-text>
            </el-col>
            <el-col :span="12">
              <el-text size="large">提示词相关性</el-text>
            </el-col>
          </el-row>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-slider v-model="editeVersion.version.times" :max="60" :min="1" show-input/>
            </el-col>
            <el-col :span="12">
              <el-slider v-model="editeVersion.version.relevance" :max="30" :min="1" show-input show-stops/>
            </el-col>
          </el-row>
        </el-col>
        <el-row>
          <el-text size="large">随机种子(Seed)</el-text>
        </el-row>
        <el-input v-model="editeVersion.version.seed" clearable placeholder="不填写为随机"/>
        <el-divider/>
        <el-col>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-text size="large">Clip Skip</el-text>
            </el-col>
            <el-col :span="12">
              <el-text size="large">ENSD</el-text>
            </el-col>
          </el-row>
          <el-row :gutter="32">
            <el-col :span="12">
              <el-slider v-model="editeVersion.version.clip_skip" :max="12" :min="1" show-input show-stops/>
            </el-col>
            <el-col :span="12">
              <el-input v-model="editeVersion.version.ensd" type="number"/>
            </el-col>
          </el-row>
        </el-col>
      </el-card>
      <el-card>
        <el-row class="space-between">
          <el-text size="large" tag="b">高清修复</el-text>
          <el-switch v-model="editeVersion.version.high_resolution"/>
        </el-row>
        <el-col v-if="editeVersion.version.high_resolution">
          <el-row>
            <el-text size="large">放大倍数 (从 1160x900 到 1024x5120)</el-text>
          </el-row>
          <el-radio-group v-model="editeVersion.version.multiple">
            <el-radio-button label="1x" value="1x"/>
            <el-radio-button label="1.5x" value="1.5x"/>
            <el-radio-button label="2x" value="2x"/>
            <el-radio-button label="3x" value="3x"/>
            <el-radio-button label="4x" value="4x"/>
            <el-radio-button label="custom" value="custom"/>
          </el-radio-group>
          <el-col v-if="editeVersion.version.multiple == 'custom'">
            <el-row :gutter="32">
              <el-col :span="12">
                <el-text size="large">调整宽度</el-text>
              </el-col>
              <el-col :span="12">
                <el-text size="large">调整高度</el-text>
              </el-col>
            </el-row>
            <el-row :gutter="32">
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.re_width" :max="5120" :min="128" show-input/>
              </el-col>
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.re_height" :max="5120" :min="128" show-input/>
              </el-col>
            </el-row>
          </el-col>
          <el-row>
            <el-text size="large">修复方式</el-text>
          </el-row>
          <el-select v-model="editeVersion.version.fix_type" filterable>
            <el-option value="None"/>
            <el-option value="Latent"/>
            <el-option value="Latent (antialiased)"/>
            <el-option value="Latent (bicubic)"/>
            <el-option value="Latent (bicubic antialiased)"/>
            <el-option value="Latent (nearest)"/>
            <el-option value="Latent (nearest-exact)"/>
            <el-option value="Lanczos"/>
            <el-option value="Nearest"/>
            <el-option value="4x-UltraSharp"/>
            <el-option value="4x_foolhardy_Remacri"/>
            <el-option value="ESRGAN_4x"/>
            <el-option value="R-ESRGAN 4x+"/>
            <el-option value="R-ESRGAN 4x+ Anime6B"/>
            <el-option value="4x_NMKD-Siax_200k"/>
            <el-option value="4x-AnimeSharp"/>
            <el-option value="4x_NMKD-Superscale-SP_178000_G"/>
            <el-option value="SwinIR_4x （速度贼慢，慎用！）"/>
            <el-option value="2x_APISR_RRDB_GAN_generator"/>
            <el-option value="4x_APISR_GRL_GAN_generator"/>
            <el-option value="DAT_x2.pth"/>
            <el-option value="DAT_x3.pth"/>
            <el-option value="DAT_x4.pth"/>
          </el-select>
          <el-col>
            <el-row :gutter="32">
              <el-col :span="12">
                <el-text size="large">高清修复采样次数</el-text>
              </el-col>
              <el-col :span="12">
                <el-text size="large">重绘噪声强度</el-text>
              </el-col>
            </el-row>
            <el-row :gutter="32">
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.fix_times" :max="60" :min="0" show-input/>
              </el-col>
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.noise" :max="1" :min="0" :step="0.01" show-input/>
              </el-col>
            </el-row>
          </el-col>
        </el-col>
      </el-card>
      <el-card>
        <el-row class="space-between">
          <el-text size="large" tag="b">ADetailer</el-text>
          <el-switch v-model="editeVersion.version.adetailer"
                     @change="(v:boolean)=>{if(v)editeVersion.version.layerdiffusion=false}"/>
        </el-row>
        <el-col v-if="editeVersion.version.adetailer">
          <el-row>
            <el-text size="large">ADetailer 模型</el-text>
          </el-row>
          <el-select v-model="editeVersion.version.adetailer_model">
            <el-option value="face_yolov8s.pt"/>
            <el-option value="face_yolov9c.pt"/>
            <el-option value="face_yolov8m.pt"/>
            <el-option value="face_yolov8n.pt"/>
            <el-option value="face_yolov8n_v2.pt"/>
            <el-option value="hand_yolov8s.pt"/>
            <el-option value="hand_yolov9c.pt"/>
            <el-option value="hand_yolov8n.pt"/>
            <el-option value="person_yolov8n-seg.pt"/>
            <el-option value="person_yolov8m-seg.pt"/>
            <el-option value="person_yolov8s-seg.pt"/>
            <el-option value="mediapipe_face_full"/>
            <el-option value="mediapipe_face_mesh"/>
            <el-option value="mediapipe_face_short"/>
            <el-option value="None"/>
          </el-select>
          <el-row>
            <el-text size="large">LoRA(风格)</el-text>
          </el-row>
          <el-col class="models">
            <model-card v-for="(lora, index) in editeVersion.version.adetailer_lora" :key="lora.uuid"
                        :model-uuid="lora.uuid" :model-version="lora.version">
              <el-button :icon="Refresh" type="success"
                         @click="replaceModel.startL((v)=>editeVersion.version.adetailer_lora[index]=v)"/>
              <el-button :icon="Delete" type="danger" @click="editeVersion.version.adetailer_lora.splice(index,1)"/>
              <model-slider v-model="lora.weight"/>
            </model-card>
            <el-button v-if="editeVersion.version.adetailer_lora?.length < 2" type="primary"
                       @click="addAdetailer.start">添加 LoRA(风格)
            </el-button>
          </el-col>
          <el-row>
            <el-text size="large">ADetailer 提示词</el-text>
          </el-row>
          <el-input v-model="editeVersion.version.adetailer_words" :rows="6" type="textarea"/>
          <el-row>
            <el-text size="large">ADetailer 负向提示</el-text>
          </el-row>
          <el-input v-model="editeVersion.version.adetailer_dewords" :rows="6" type="textarea"/>
          <el-col class="space-between">
            <el-text size="large">步数</el-text>
            <el-switch v-model="editeVersion.version.use_adetailer_steps"/>
          </el-col>
          <el-slider v-model="editeVersion.version.adetailer_steps"
                     :disabled="!editeVersion.version.use_adetailer_steps" :max="60"
                     :min="0" show-input/>
          <el-row>
            <el-text size="large">置信度</el-text>
          </el-row>
          <el-slider v-model="editeVersion.version.confidence" :max="1" :min="0" :step="0.01" show-input/>
          <el-col>
            <el-row :gutter="32">
              <el-col :span="12">
                <el-text size="large">重绘蒙版模糊</el-text>
              </el-col>
              <el-col :span="12">
                <el-text size="large">重绘噪声强度</el-text>
              </el-col>
            </el-row>
            <el-row :gutter="32">
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.mask_blur" :max="64" :min="0" show-input/>
              </el-col>
              <el-col :span="12">
                <el-slider v-model="editeVersion.version.repaint_noise" :max="1" :min="0" :step="0.01" show-input/>
              </el-col>
            </el-row>
          </el-col>
          <el-checkbox v-model="editeVersion.version.mask_only" label="仅重绘蒙版区域" size="large"/>
        </el-col>
      </el-card>
      <el-card>
        <el-row class="space-between">
          <el-text size="large" tag="b">Layer Diffusion</el-text>
          <el-switch v-model="editeVersion.version.layerdiffusion"
                     @change="(v:boolean)=>{if(v)editeVersion.version.adetailer=false}"/>
        </el-row>
        <el-col v-if="editeVersion.version.layerdiffusion">
          <el-text size="large">权重</el-text>
          <el-slider v-model="editeVersion.version.weighting" :max="2" :min="0" :step="0.1" show-input show-stops/>
        </el-col>
      </el-card>
    </el-form>
    <template #footer>
      <el-button :icon="Check" type="primary" @click="editeVersion.finish"/>
      <el-button :icon="Close" type="danger" @click="handleClose(()=>editeVersion.show = false)"/>
    </template>
  </el-dialog>
  <el-dialog v-model="setBaseModel.show" title="设置基础模型" @opened="setBaseModel.focusInput?.focus">
    <el-select ref="base_model_input"
               v-model="setBaseModel.model.uuid"
               filterable
               @change="setBaseModel.model.version = models.find(v=>v.uuid === setBaseModel.model.uuid)?.versions[0]">
      <el-option v-for="model in models.filter(v=>v.type === 0)" :key="model.uuid" :label="model.title"
                 :value="model.uuid"/>
    </el-select>
    <el-radio-group v-if="setBaseModel.model.uuid" v-model="setBaseModel.model.version" style="margin-top: 6px;">
      <el-radio-button v-for="version in models.find(v=>v.uuid === setBaseModel.model.uuid)?.versions" :key="version"
                       :label="version" :value="version"/>
    </el-radio-group>
    <template #footer>
      <el-button :icon="Check" type="primary" @click="setBaseModel.finish"/>
      <el-button :icon="Close" type="danger" @click="setBaseModel.show = false"/>
    </template>
  </el-dialog>
  <el-dialog v-model="addModel.show" title="添加模型" @opened="addModel.focusInput?.focus">
    <el-select ref="add_model_input"
               v-model="addModel.model.uuid"
               filterable
               @change="addModel.model.version = models.find(v=>v.uuid === addModel.model.uuid)?.versions[0]">
      <el-option v-for="model in models.filter(v=>v.type === addModel.type)" :key="model.uuid" :label="model.title"
                 :value="model.uuid"/>
    </el-select>
    <el-radio-group v-if="addModel.model.uuid" v-model="addModel.model.version" style="margin-top: 6px;">
      <el-radio-button v-for="version in models.find(v=>v.uuid === addModel.model.uuid)?.versions" :key="version"
                       :label="version" :value="version"/>
    </el-radio-group>
    <template #footer>
      <el-button :disabled="!addModel.model.version" :icon="Check" type="primary" @click="addModel.finish"/>
      <el-button :icon="Close" type="danger" @click="addModel.show = false"/>
    </template>
  </el-dialog>
  <el-dialog v-model="addAdetailer.show" title="添加 LoRA(风格)" @opened="addAdetailer.focusInput?.focus">
    <el-select ref="add_adetailer_input"
               v-model="addAdetailer.model.uuid"
               filterable
               @change="addAdetailer.model.version = models.find(v=>v.uuid === addAdetailer.model.uuid)?.versions[0]">
      <el-option v-for="model in models.filter(v=>v.type === 1)" :key="model.uuid" :label="model.title"
                 :value="model.uuid"/>
    </el-select>
    <el-radio-group v-if="addAdetailer.model.uuid" v-model="addAdetailer.model.version" style="margin-top: 6px;">
      <el-radio-button v-for="version in models.find(v=>v.uuid === addAdetailer.model.uuid)?.versions" :key="version"
                       :label="version" :value="version"/>
    </el-radio-group>
    <template #footer>
      <el-button :disabled="!addAdetailer.model.version" :icon="Check" type="primary" @click="addAdetailer.finish"/>
      <el-button :icon="Close" type="danger" @click="addAdetailer.show = false"/>
    </template>
  </el-dialog>
  <el-dialog v-model="replaceModel.show" title="替换模型" @opened="replaceModel.focusInput?.focus">
    <el-select ref="replace_model_input"
               v-model="replaceModel.model.uuid"
               filterable
               @change="replaceModel.model.version = models.find(v=>v.uuid === replaceModel.model.uuid)?.versions[0]">
      <el-option v-for="model in replaceModel.models" :key="model.uuid" :label="model.title"
                 :value="model.uuid"/>
    </el-select>
    <el-radio-group v-if="replaceModel.model.uuid" v-model="replaceModel.model.version" style="margin-top: 6px;">
      <el-radio-button v-for="version in models.find(v=>v.uuid === replaceModel.model.uuid)?.versions" :key="version"
                       :label="version" :value="version"/>
    </el-radio-group>
    <template #footer>
      <el-button :disabled="!replaceModel.model.version" :icon="Check" type="primary" @click="replaceModel.finish"/>
      <el-button :icon="Close" type="danger" @click="replaceModel.show = false"/>
    </template>
  </el-dialog>
  <el-drawer id="shower" v-model="showVersion.show">
    <template #header>
      <el-text size="large" tag="b">{{ showVersion.version.title }}</el-text>
    </template>
    <el-card>
      <el-row>
        <el-text tag="b">提示词</el-text>
        <el-button v-if="showVersion.version.words.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('提示词已复制', 'success', ()=>writeText(showVersion.version.words))"/>
      </el-row>
      <el-row>
        <el-input ref="showWords" :value="showVersion.version.words" autosize disabled type="textarea"/>
      </el-row>
      <el-row>
        <el-text tag="b">负向提示</el-text>
        <el-button v-if="showVersion.version.dewords.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('负向提示已复制', 'success', ()=>writeText(showVersion.version.dewords))"/>
      </el-row>
      <el-row>
        <el-input ref="showDewords" :value="showVersion.version.dewords" autosize disabled type="textarea"/>
      </el-row>
      <el-row>
        <el-checkbox v-model="showVersion.version.a1111" disabled label="A1111"/>
        <el-checkbox v-model="showVersion.version.ella" disabled label="Ella"/>
      </el-row>
    </el-card>
    <el-card>
      <el-row>
        <el-text tag="b">模型</el-text>
      </el-row>
      <el-row>
        <el-card class="model">
          <el-text type="info">{{ models.find(v => v.uuid === showVersion.version.base_model.uuid)?.title }} -
            {{ showVersion.version.base_model.version }}
          </el-text>
        </el-card>
      </el-row>
      <el-row>
        <el-checkbox v-model="showVersion.version.sdxl_refiner" disabled label="SDXL Refiner"/>
      </el-row>
      <el-row v-for="templater in showVersion.version.lora_models">
        <el-card class="model">
          <template #header>
            <el-text type="info">{{ models.find(v => v.uuid === templater.uuid)?.title }} - {{ templater.version }}
            </el-text>
          </template>
          <el-slider v-model="templater.weight" :max="2" :min="-2" :step="0.1" disabled show-input/>
        </el-card>
      </el-row>
      <el-row v-for="templter in showVersion.version.embedding_models">
        <el-card class="model">
          <template #header>
            {{ models.find(v => v.uuid === templter.uuid)?.title }} - {{ templter.version }}
          </template>
          <el-slider v-model="templter.weight" :max="2" :min="-2" :step="0.1" disabled show-input/>
        </el-card>
      </el-row>
      <el-row>
        <el-text tag="b">VAE</el-text>
      </el-row>
      <el-row>
        <el-text tag="p" type="info">{{ showVersion.version.vae }}</el-text>
      </el-row>
    </el-card>
    <el-card>
      <template #header>
        <el-text size="large" tag="b">设置</el-text>
      </template>
      <el-row>
        <el-text tag="b">图片大小</el-text>
      </el-row>
      <el-row>
        <el-col>
          <el-text type="info">
            {{ showVersion.version.size }}
          </el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="b">宽</el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="b">高</el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="p" type="info">
            {{ whatIsMyWidth(showVersion.version.size, showVersion.version.width) }}
          </el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="p" type="info">
            {{ whatIsMyHeight(showVersion.version.size, showVersion.version.height) }}
          </el-text>
        </el-col>
      </el-row>
      <template v-if="showVersion.version.senior">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-text tag="b">采样器</el-text>
          </el-col>
          <el-col :span="12">
            <el-text tag="b">调度器</el-text>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-text type="info">
              {{ showVersion.version.sampler }}
            </el-text>
          </el-col>
          <el-col :span="12">
            <el-text type="info">
              {{ showVersion.version.scheduler }}
            </el-text>
          </el-col>
        </el-row>
      </template>
      <template v-else>
        <el-row>
          <el-text tag="b">采样算法(Sampler)</el-text>
        </el-row>
        <el-row>
          <el-col>
            <el-text type="info">
              {{ showVersion.version.algorithm }}
            </el-text>
          </el-col>
        </el-row>
      </template>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="b">采样次数</el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="b">提示词相关性</el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.times }}
          </el-text>
        </el-col>
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.relevance }}
          </el-text>
        </el-col>
      </el-row>
      <el-row>
        <el-text tag="b">随机种子(Seed)</el-text>
      </el-row>
      <el-row>
        <el-col>
          <el-text type="info">
            {{ showVersion.version.seed || '/* No response */' }}
          </el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="b">Clip Skip</el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="b">ENSD</el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.clip_skip }}
          </el-text>
        </el-col>
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.ensd }}
          </el-text>
        </el-col>
      </el-row>
    </el-card>
    <el-card v-if="showVersion.version.high_resolution">
      <template #header>
        <el-text size="large" tag="b">高清修复</el-text>
      </template>
      <el-row>
        <el-text tag="b">放大倍数 (从 936x1120 到 0x5120)</el-text>
      </el-row>
      <el-row>
        <el-text type="info">{{ showVersion.version.multiple }}</el-text>
      </el-row>
      <template v-if="showVersion.version.multiple == 'custom'">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-text tag="b">调整宽度</el-text>
          </el-col>
          <el-col :span="12">
            <el-text tag="b">调整宽度</el-text>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-text type="info">
              {{ showVersion.version.re_width }}
            </el-text>
          </el-col>
          <el-col :span="12">
            <el-text type="info">
              {{ showVersion.version.re_width }}
            </el-text>
          </el-col>
        </el-row>
      </template>
      <el-row>
        <el-text tag="b">修复方式</el-text>
      </el-row>
      <el-row>
        <el-text tag="p" type="info">{{ showVersion.version.fix_type }}</el-text>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="b">高清修复采样次数</el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="b">重绘噪声强度</el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.fix_times }}
          </el-text>
        </el-col>
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.noise }}
          </el-text>
        </el-col>
      </el-row>
    </el-card>
    <el-card v-if="showVersion.version.adetailer">
      <template #header>
        <el-text size="large" tag="b">ADetailer</el-text>
      </template>
      <el-row>
        <el-text tag="b">ADetailer 模型</el-text>
      </el-row>
      <el-row>
        <el-text type="info">{{ showVersion.version.adetailer_model }}</el-text>
      </el-row>
      <el-row v-for="templter in showVersion.version.adetailer_lora">
        <el-card class="model">
          <template #header>
            {{ models.find(v => v.uuid === templter.uuid)?.title }} - {{ templter.version }}
          </template>
          <el-slider v-model="templter.weight" :max="2" :min="-2" :step="0.1" disabled show-input/>
        </el-card>
      </el-row>
      <el-row>
        <el-text tag="b">ADetailer 提示词</el-text>
        <el-button v-if="showVersion.version.adetailer_words.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('提示词已复制', 'success', ()=>writeText(showVersion.version.adetailer_words))"/>
      </el-row>
      <el-row>
        <el-input ref="showAdWords" :value="showVersion.version.adetailer_words" autosize disabled type="textarea"/>
      </el-row>
      <el-row>
        <el-text tag="b">ADetailer 负向提示</el-text>
        <el-button v-if="showVersion.version.adetailer_dewords.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('负向提示已复制', 'success', ()=>writeText(showVersion.version.adetailer_dewords))"/>
      </el-row>
      <el-row>
        <el-input ref="showAdDewords" :value="showVersion.version.adetailer_dewords" autosize disabled
                  type="textarea"/>
      </el-row>
      <el-row>
        <el-text tag="b">步数</el-text>
      </el-row>
      <el-row>
        <el-text tag="p" type="info">
          {{ showVersion.version.use_adetailer_steps ? showVersion.version.adetailer_steps : -1 }}
        </el-text>
      </el-row>
      <el-row>
        <el-text tag="b">置信度</el-text>
      </el-row>
      <el-row>
        <el-text tag="p" type="info">{{ showVersion.version.confidence }}</el-text>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text tag="b">重绘蒙版模糊</el-text>
        </el-col>
        <el-col :span="12">
          <el-text tag="b">重绘噪声强度</el-text>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.mask_blur }}
          </el-text>
        </el-col>
        <el-col :span="12">
          <el-text type="info">
            {{ showVersion.version.repaint_noise }}
          </el-text>
        </el-col>
      </el-row>
      <el-row>
        <el-checkbox v-model="showVersion.version.mask_only" disabled label="仅重绘蒙版区域"/>
      </el-row>
    </el-card>
    <el-card v-if="showVersion.version.layerdiffusion">
      <template #header>
        <el-text size="large" tag="b">Layer Diffusion</el-text>
      </template>
      <el-row>
        <el-text tag="b">权重</el-text>
      </el-row>
      <el-row>
        <el-text type="info">{{ showVersion.version.weighting }}</el-text>
      </el-row>
    </el-card>
  </el-drawer>
</template>

<style scoped>
.card-header, .space-between {
  display: grid;
  grid-template-columns: 1fr auto
}

.models > * {
  width: 100%;
}

.models > *:not(:last-child) {
  margin-bottom: 5px;
}

#shower .el-card, #shower .el-card .el-row:not(:first-child) {
  margin-top: 10px;
}

.model {
  width: 100%;
}

:deep(.el-card__header) {
  position: relative;
}

.views {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.version-control.el-button {
  position: relative;
  border-radius: 0;
  margin: 0;
}

.left-control.el-button {
  border-radius: var(--el-border-radius-base) 0 0 var(--el-border-radius-base);
}

.right-control.el-button {
  border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;
}

:deep(.el-card__header):has(.card-header) div:not(:first-child) {
  margin-top: 10px;
}

.el-image {
  border-radius: var(--el-border-radius-base);
  transition: filter .3s ease-in-out;
}

.el-image:hover {
  filter: contrast(100%) !important;
}

/* 缩略图容器：带宽高变化过渡 */
.thumb-wrapper {
  width: 200px;
  height: 200px;
  min-width: 200px;
  min-height: 200px;
  overflow: hidden;
  border-radius: var(--el-border-radius-base);
  transition: width 0.3s ease, height 0.3s ease;
}

/* 缩略图加载占位骨架屏 */
.thumb-loading {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--el-border-radius-base);
  background: linear-gradient(90deg, #f0f0f0 25%, #e6e6e6 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: thumb-shimmer 1.5s infinite linear;
}

.thumb-loading-text {
  color: #999;
  font-size: 12px;
  animation: thumb-pulse 1s infinite ease-in-out;
}

/* 缩略图淡入 */
.thumb-fade {
  animation: thumb-fade-in 0.3s ease-in;
}

@keyframes thumb-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes thumb-pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

@keyframes thumb-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>