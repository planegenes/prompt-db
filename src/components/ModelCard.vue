<script lang="ts" setup>
import {defineProps, ref, watch} from "vue";
import {db} from "../database";
import {Model} from "../types/model.ts";
import {CopyDocument} from "@element-plus/icons-vue";
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {processTemplatesPlain} from "../utils.ts";

const props = defineProps({
  modelUuid: {
    type: String,
  },
  modelVersion: {
    type: String,
  },
  hideFooter: {
    type: Boolean,
    default: false
  }
})

const model = ref<Model | null>(null)
let loadingId = 0

watch(() => props.modelUuid, async (uuid) => {
  const currentLoadingId = ++loadingId
  const nextModel = uuid ? await db.models.get(uuid) as Model ?? null : null
  if (currentLoadingId === loadingId) model.value = nextModel
}, {immediate: true})

const type_badges = [
  {text: "基础模型", offset: -42},
  {text: "LoRA", offset: -24},
  {text: "Embedding", offset: -60}
]
</script>

<template>
  <el-badge :offset="[type_badges[model?.type ?? 0].offset,0]" :value="type_badges[model?.type ?? 0].text" type="info">
    <el-card shadow="always">
      <template #header>
        {{ model?.title ?? 'invalid model' }} - {{ modelVersion }}
      </template>
      <span :class="model?.words?'':'hide'">
        <span v-if="model?.words">
          <el-button type="primary" @click="writeText(processTemplatesPlain(model.words))" text circle :icon="CopyDocument"/>
          <el-text type="primary" v-html="processTemplatesPlain(model.words)"/>
        </span>
        <el-divider v-if="model?.words && model?.dewords"/>
        <span v-if="model?.dewords">
          <el-button type="info" @click="writeText(processTemplatesPlain(model.dewords))" text circle :icon="CopyDocument"/>
          <el-text type="info" v-html="processTemplatesPlain(model.dewords)"/>
        </span>
      </span>
      <template v-if="!props.hideFooter" #footer>
        <el-button :icon="CopyDocument" type="primary" @click="writeText(model?.words)"/>
        <slot/>
      </template>
    </el-card>
  </el-badge>
</template>

<style scoped>
.el-card.hide .el-card__body {
  display: none;
}
</style>