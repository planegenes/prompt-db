<script lang="ts" setup>
import {computed, onMounted, onUnmounted, ref, Ref, watch} from "vue";
import {liveQuery, Subscription} from "dexie";
import {db} from "../database";
import {Model} from "../types/model.ts";
import {ElMessage, ElMessageBox} from "element-plus";
import {Check, Close, CopyDocument, Delete, Edit} from "@element-plus/icons-vue";
import DraggableInputTag from "../components/DraggableInputTag.vue";
import {debounce, handleClose, processTemplates} from "../utils.ts";

const models: Ref<Model[]> = ref([])
let models_subscription: Subscription | null = null

const filters = ref('')
const debouncedFilters = ref('')
const currentPage = ref(1)
const pageSize = 100

const updateDebouncedFilters = debounce((value: string) => {
  debouncedFilters.value = value
}, 300)

watch(filters, (newVal) => {
  updateDebouncedFilters(newVal)
}, { immediate: true })

watch(debouncedFilters, () => {
  currentPage.value = 1
})

const filted = computed(() => {
  const keywords = debouncedFilters.value.split(/\s+/).map(k => k.trim().toLowerCase()).filter(Boolean)
  if (keywords.length === 0) return models.value
  return models.value.filter(val => {
    const text = JSON.stringify(val).toLowerCase()
    return keywords.every(k => text.includes(k))
  })
})

const pagedModels = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filted.value.slice(start, start + pageSize)
})

const total = computed(() => filted.value.length)

const type_badges = [
  {text: "B", color: "Salmon"},
  {text: "L", color: "Blue"},
  {text: "E", color: "Green"}
]

const newModel = () => {
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
        const newValue = new Model(value)
        db.models.add(newValue)
        editeModel.value.start(newValue)
      })
      .catch((e) => {
        ElMessage({
          type: 'info',
          message: 'Input canceled',
        })
        console.error(e)
      })
}

const editeModel = ref({
  show: false,
  model: {} as Model,
  editingTitle: false,
  spaceDelimit: "//",
  start: (value: Model) => {
    editeModel.value.model = JSON.parse(JSON.stringify(value))
    editeModel.value.show = true
  },
  finish: async () => {
    const value = JSON.parse(JSON.stringify(editeModel.value.model));
    await db.models.update(value.uuid, value)
    editeModel.value.show = false
  }
})

const deleteModel = async (uuid: string) => {
  await db.models.delete(uuid)
}
const updateModel = async (uuid: string, newValue) => {
  await db.models.update(uuid, newValue)
}

const copyModel = async (value: Model) => {
  let newValue = new Model()
  let {uuid: _uuid, date: _date, ...changes} = value
  changes.title = `${value.title}_副本_${new Date(newValue.date).toLocaleDateString()}`
  Object.assign(newValue, changes)
  await db.models.add(JSON.parse(JSON.stringify(newValue)))
}

onMounted(() => {
  models_subscription = liveQuery(() => db.models.toArray())
      .subscribe({
        next: (result) => {
          models.value = result.sort((a, b) => a.date < b.date ? 1 : -1)
        }
      })
})

onUnmounted(() => {
  models_subscription?.unsubscribe()
})
</script>

<template>
  <el-button type="danger" @click="newModel">ADD</el-button>
  <el-input v-model="filters" placeholder="输入关键词，空格分隔" size="large" clearable style="margin-top: 10px;"/>
  <el-main class="main">
    <el-badge v-for="model in pagedModels" :key="model.uuid" :color="type_badges[model.type].color" :offset="[-2,2]"
              :value="type_badges[model.type].text" class="card"
              @dblclick="updateModel(model.uuid, {type: (model.type+1)%3})">
      <el-card>
        <template #header>
          <div class="card-header">
            <span>{{ model.title }}</span>
            <span>
              <el-button :icon="Edit" circle size="small" type="primary" @click="editeModel.start(model)"/>
              <el-button :icon="Delete" circle size="small" type="danger"
                         @click="handleClose(()=>deleteModel(model.uuid), 'Are you sure to delete this model?')"/>
              <el-button :icon="CopyDocument" circle size="small" type="success" @click="copyModel(model)"/>
            </span>
          </div>
        </template>
        <span :class="(model.words||model.dewords||model.labels.length)?'':'hide'">
          <el-row class="tags">
            <el-tag v-for="(label, index) in model.labels" :key="index" effect="dark" type="primary">{{
                label
              }}</el-tag>
          </el-row>
          <el-text v-if="model.words" v-html="processTemplates(model.words)"/>
          <el-divider v-if="model.words && model.dewords"/>
          <el-text v-if="model.dewords" type="info" v-html="processTemplates(model.dewords)"/>
        </span>
        <template #footer>
          <draggable-input-tag v-model="model.tags" tag-effect="dark" tag-type="primary" clearable
                               @change="(value: string[])=>updateModel(model.uuid, JSON.parse(JSON.stringify(model)))"/>
        </template>
      </el-card>
    </el-badge>
  </el-main>
  <el-pagination
      v-if="total > pageSize"
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      layout="prev, pager, next, jumper, total"
      style="justify-content: center; margin-top: 10px;"
  />
  <el-dialog
      v-if="editeModel.show"
      v-model="editeModel.show"
      :before-close="handleClose"
      preset="card"
      style="width: 80%; margin: 10% auto"
  >
    <template #header>
      <el-input v-if="editeModel.editingTitle || (!editeModel.model.title)"
                v-model="editeModel.model.title" clearable
                @change="editeModel.editingTitle = false"/>
      <el-text v-else size="large" @dblclick="editeModel.editingTitle = true">
        {{ editeModel.model.title }}
      </el-text>
    </template>
    <el-form :model="editeModel.model">
      <el-row>
        <el-text size="large">提示词</el-text>
      </el-row>
      <el-input v-model="editeModel.model.words" :rows="4" type="textarea"/>
      <el-row>
        <el-text size="large">逆向提示词</el-text>
      </el-row>
      <el-input v-model="editeModel.model.dewords" :rows="3" type="textarea"/>
      <el-row>
        <el-text size="large">类型</el-text>
      </el-row>
      <el-select v-model="editeModel.model.type">
        <el-option :value="0" label="基础模型"/>
        <el-option :value="1" label="LoRA"/>
        <el-option :value="2" label="Embedding"/>
      </el-select>
      <el-col class="grid2">
        <el-text size="large">版本</el-text>
        <draggable-input-tag v-model="editeModel.model.versions" :delimiter="editeModel.spaceDelimit" tag-effect="plain"
                             tag-type="primary" clearable/>
      </el-col>
      <el-col class="grid2">
        <el-text size="large">标签</el-text>
        <draggable-input-tag v-model="editeModel.model.labels" :delimiter="editeModel.spaceDelimit" tag-effect="plain"
                             tag-type="primary" clearable/>
      </el-col>
      <el-col class="grid2">
        <el-text size="large">分割字符</el-text>
        <el-input v-model="editeModel.spaceDelimit" clearable/>
      </el-col>
    </el-form>
    <template #footer>
      <el-button :disabled="editeModel.model.versions.length === 0" :icon="Check" type="primary"
                 @click="editeModel.finish()"/>
      <el-button :icon="Close" type="danger" @click="handleClose(()=>editeModel.show = false)"/>
    </template>
  </el-dialog>
</template>

<style scoped>
.tags {
  gap: 4px 5px;
}

.grid2 {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-column-gap: 8px;
}

.grid2 > .el-text {
  margin-bottom: 0;
}

.main .el-badge {
  width: 100%;
  break-inside: avoid; /* 防止元素被截断分列显示 */
  margin-bottom: 10px; /* 保留元素间距 */
}

:deep(.el-badge__content.is-fixed) {
  line-height: 0;
}
</style>