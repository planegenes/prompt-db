<script lang="ts" setup>
import {computed, nextTick, onMounted, onUnmounted, ref, Ref, useTemplateRef, watch} from "vue";
import {liveQuery, Subscription} from "dexie";
import {db} from "../database";
import {Command} from "../types/command.ts";
import {ElMessage, ElMessageBox} from "element-plus";
import {ArrowDown, ArrowRight, Check, Close, CopyDocument, Delete, Edit, Hide, View} from "@element-plus/icons-vue";
import {handleClose, messageWithEl, processTemplatesPlain, debounce} from "../utils.ts";
import {open} from "@tauri-apps/plugin-dialog";
import {path} from "@tauri-apps/api";
import {platform} from "@tauri-apps/plugin-os";
import CommandCard from "../components/CommandCard.vue";
import {useNSFWStore} from '../store/nsfwStore.ts';
import emitter from "../mitt.ts";
import ModelCard from "../components/ModelCard.vue";
import {Model} from "../types/model.ts";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import ModelSlider from "../components/ModelSlider.vue";
import DraggableInputTag from "../components/DraggableInputTag.vue";

const nsfwStore = useNSFWStore()
const recentPage = ref(1)

const filters = ref('')
const debouncedFilters = ref('')
const commands: Ref<Command[]> = ref([])
let commands_subscription: Subscription | null = null

const updateDebouncedFilters = debounce((value: string) => {
  debouncedFilters.value = value
}, 300)

watch(filters, (newVal) => {
  updateDebouncedFilters(newVal)
}, {immediate: true})

watch(debouncedFilters, () => {
  recentPage.value = 1
})

const filted = computed(() => {
  const keywords = debouncedFilters.value.split(/\s+/).map(k => k.trim().toLowerCase()).filter(Boolean)
  if (keywords.length === 0) return commands.value
  return commands.value.filter(val => {
    const text = JSON.stringify(val).toLowerCase()
    return keywords.every(k => text.includes(k))
  })
})
const pageCommands = computed(() => filted.value.slice((recentPage.value - 1) * 20, Math.min(recentPage.value * 20, filted.value.length)))

const models: Ref<Model[]> = ref([])
let models_subscription: Subscription | null = null

const newCommand = () => {
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
        const newValue = new Command(value)
        db.commands.add(newValue)
        editeCommand.value.start(newValue)
      })
      .catch((e) => {
        ElMessage({
          type: 'info',
          message: 'Input canceled',
        })
        console.error(e)
      })
}

const editeCommand = ref({
  show: false,
  command: {} as Command,
  editingTitle: false,
  start: (value: Command) => {
    editeCommand.value.command = JSON.parse(JSON.stringify(value))
    editeCommand.value.show = true
  },
  finish: async () => {
    const value = JSON.parse(JSON.stringify(editeCommand.value.command));
    await db.commands.update(value.uuid, value)
    editeCommand.value.show = false
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
    if (!editeCommand.value.command.adetailer_lora.find(v => v.uuid == addAdetailer.value.model.uuid))
      editeCommand.value.command.adetailer_lora.push({...addAdetailer.value.model, weight: 0.8})
    addAdetailer.value.show = false
  }
})

const deleteCommand = async (uuid: string) => {
  await db.commands.delete(uuid)
}
const updateCommand = async (uuid: string, newValue) => {
  await db.commands.update(uuid, newValue)
}

const copyCommand = async (value: Command) => {
  let newValue = new Command()
  let {uuid: _uuid, date: _date, ...changes} = value
  changes.title = `${value.title}_副本_${new Date(newValue.date).toLocaleDateString()}`
  Object.assign(newValue, changes)
  await db.commands.add(JSON.parse(JSON.stringify(newValue)))
}

const showWords = ref()
const showDewords = ref()
const showAdWords = ref()
const showAdDewords = ref()

const showCommand = ref({
  show: false,
  command: new Command(),
  start: (value: Command) => {
    showCommand.value.command = JSON.parse(JSON.stringify(value))
    showCommand.value.command.words = processTemplatesPlain(showCommand.value.command.words)
    showCommand.value.command.dewords = processTemplatesPlain(showCommand.value.command.dewords)
    showCommand.value.command.adetailer_words = processTemplatesPlain(showCommand.value.command.adetailer_words)
    showCommand.value.command.adetailer_dewords = processTemplatesPlain(showCommand.value.command.adetailer_dewords)
    nextTick(() => {
      showWords.value?.resizeTextarea()
      showDewords.value?.resizeTextarea()
      showAdWords.value?.resizeTextarea()
      showAdDewords.value?.resizeTextarea()
    })
    showCommand.value.show = true
  }
})

const addImg = async (command_uuid: string, index: number) => {
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
    let command = commands.value.find(v => v.uuid == command_uuid)
    for (const file of files) {
      let normalized: string
      if (platform() !== "android" && platform() !== "ios") {
        normalized = (await path.normalize(file)).replace(/\\/gi, "/");
      } else {
        normalized = file
      }
      if (command.imgs.includes(normalized)) {
        ElMessage('图片已存在：' + normalized);
        continue;
      }
      command.imgs.splice(++index, 0, normalized)
    }
    await db.commands.update(command.uuid, JSON.parse(JSON.stringify(command)))
  } catch (error) {
    ElMessage('图片添加失败:' + error);
  }
}

const pushImg = async (command_uuid: string, index: number) => {
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
    let command = commands.value.find(v => v.uuid == command_uuid)
    for (const file of files) {
      let normalized: string
      if (platform() !== "android" && platform() !== "ios") {
        normalized = (await path.normalize(file)).replace(/\\/gi, "/");
      } else {
        normalized = file
      }
      if (command.imgs.includes(normalized)) {
        ElMessage('图片已存在：' + normalized);
        continue;
      }
      command.imgs.splice(index++, 0, normalized)
    }
    await db.commands.update(command.uuid, JSON.parse(JSON.stringify(command)))
  } catch (error) {
    ElMessage('图片添加失败:' + error);
  }
}

const delImg = async (command_uuid: string, index: number) => {
  const command = commands.value.find(v=>v.uuid==command_uuid)
  command.imgs.splice(index, 1)
  await db.commands.update(command_uuid, JSON.parse(JSON.stringify(command)))
}

onMounted(() => {
  commands_subscription = liveQuery(() => db.commands.toArray())
      .subscribe({
        next: (result) => {
          commands.value = result.sort((a, b) => a.date < b.date ? 1 : -1)
        }
      })
  models_subscription = liveQuery(() => db.models.toArray())
      .subscribe({
        next: (result) => {
          models.value = result
        }
      })
  recentPage.value = Number(sessionStorage.getItem("commandPage") ?? 1)
  const saved = sessionStorage.getItem("commandFilters")
  try {
    const parsed = saved ? JSON.parse(saved) : null
    filters.value = Array.isArray(parsed) ? parsed.join(' ') : (saved ?? '')
  } catch {
    filters.value = saved ?? ''
  }
})

onUnmounted(() => {
  commands_subscription?.unsubscribe()
  models_subscription?.unsubscribe()
  sessionStorage.setItem("commandPage", String(recentPage.value))
  sessionStorage.setItem("commandFilters", JSON.stringify(filters.value))
})
</script>

<template>
  <el-button type="success" @click="newCommand" @mouseleave="nsfwStore['cancel']" @mouseover="nsfwStore['load']">ADD
  </el-button>
  <el-input v-model="filters" placeholder="输入关键词，空格分隔" size="large" clearable style="margin-top: 10px;"/>
  <el-main class="main">
    <command-card v-for="command in pageCommands" :key="command.uuid"
                  :nsfw="nsfwStore.enable" :prompt-object="command" :rate="nsfwStore.rate"
                  @add-img="addImg" @del-img="delImg" @push-img="pushImg">
      <template #header>
        <div class="card-header">
          <span>
            <el-button :icon="command.unfolding?ArrowDown:ArrowRight"
                       circle size="small" @click="updateCommand(command.uuid, {unfolding: !command.unfolding})"/>
          <span>{{ command.title }}</span></span>
          <span>
            <el-button :icon="View" circle size="small" type="info" @click="showCommand.start(command)"/>
            <el-button :icon="Edit" circle size="small" type="primary" @click="editeCommand.start(command)"/>
            <el-button :icon="Delete" circle size="small" type="danger"
                       @click="handleClose(()=>deleteCommand(command.uuid), 'Are you sure to delete this command?')"/>
            <el-button :icon="CopyDocument" circle size="small" type="success" @click="copyCommand(command)"/>
          </span>
        </div>
      </template>
      <template #footer>
        <el-col>
          <draggable-input-tag v-model="command.tags" tag-effect="dark" tag-type="primary" clearable
                               @change="updateCommand(command.uuid, JSON.parse(JSON.stringify(command)))"/>
        </el-col>
        <el-col>
          <el-switch v-model="command.showImg" :active-action-icon="View" :inactive-action-icon="Hide"
                     @change="v=>updateCommand(command.uuid, {showImg:v})"/>
          <el-rate v-model="command.rate" :colors="['#4CAF50','#FF9800','#C62828']" clearable
                   size="large" @change="v=>updateCommand(command.uuid, {rate:v})"/>
        </el-col>
      </template>
    </command-card>
  </el-main>
  <el-footer>
    <el-pagination v-model:current-page="recentPage" :page-count="Math.ceil(filted.length/20)"
                   background layout="prev, pager, next" size="large" @change="emitter.emit('scroll-to-top')"/>
  </el-footer>
  <el-dialog
      v-if="editeCommand.show"
      v-model="editeCommand.show"
      :before-close="handleClose"
      preset="card"
      style="width: 80%; margin: 10% auto"
  >
    <template #header>
      <el-input v-if="editeCommand.editingTitle || (!editeCommand.command.title)"
                v-model="editeCommand.command.title" clearable
                @change="editeCommand.editingTitle = false"/>
      <el-text v-else size="large" @dblclick="editeCommand.editingTitle = true">
        {{ editeCommand.command.title }}
      </el-text>
    </template>
    <el-form :model="editeCommand.command">
      <el-card>
        <el-row>
          <el-text size="large">提示词</el-text>
        </el-row>
        <el-input v-model="editeCommand.command.words" :rows="6" type="textarea"/>
        <el-divider/>
        <el-row>
          <el-text size="large">逆向提示词</el-text>
        </el-row>
        <el-input v-model="editeCommand.command.dewords" :rows="4" type="textarea"/>
      </el-card>
      <el-card>
        <el-row class="space-between">
          <el-text size="large" tag="b">ADetailer</el-text>
          <el-switch v-model="editeCommand.command.adetailer"/>
        </el-row>
        <el-col v-if="editeCommand.command.adetailer">
          <el-row>
            <el-text size="large">ADetailer 模型</el-text>
          </el-row>
          <el-select v-model="editeCommand.command.adetailer_model">
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
            <model-card v-for="(lora, index) in editeCommand.command.adetailer_lora" :key="lora.uuid"
                        :model-uuid="lora.uuid" :model-version="lora.version">
              <el-button :icon="Delete" type="danger" @click="editeCommand.command.adetailer_lora.splice(index,1)"/>
              <model-slider v-model="lora.weight"/>
            </model-card>
            <el-button type="primary" @click="addAdetailer.start">添加 LoRA(风格)</el-button>
          </el-col>
          <el-row>
            <el-text size="large">ADetailer 提示词</el-text>
          </el-row>
          <el-input v-model="editeCommand.command.adetailer_words" :rows="6" type="textarea"/>
          <el-row>
            <el-text size="large">ADetailer 负向提示</el-text>
          </el-row>
          <el-input v-model="editeCommand.command.adetailer_dewords" :rows="6" type="textarea"/>
        </el-col>
      </el-card>
    </el-form>
    <template #footer>
      <el-button :icon="Check" type="primary" @click="editeCommand.finish()"/>
      <el-button :icon="Close" type="danger" @click="handleClose(()=>editeCommand.show = false)"/>
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
  <el-drawer id="shower" v-model="showCommand.show">
    <template #header>
      <el-text size="large" tag="b">{{ showCommand.command.title }}</el-text>
    </template>
    <el-card>
      <el-row>
        <el-text tag="b">提示词</el-text>
        <el-button v-if="showCommand.command.words.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('提示词已复制', 'success', ()=>writeText(showCommand.command.words))"/>
      </el-row>
      <el-row>
        <el-input ref="showWords" :value="showCommand.command.words" autosize disabled type="textarea"/>
      </el-row>
      <el-row>
        <el-text tag="b">负向提示</el-text>
        <el-button v-if="showCommand.command.dewords.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('负向提示已复制', 'success', ()=>writeText(showCommand.command.dewords))"/>
      </el-row>
      <el-row>
        <el-input ref="showDewords" :value="showCommand.command.dewords" autosize disabled type="textarea"/>
      </el-row>
    </el-card>
    <el-card v-if="showCommand.command.adetailer">
      <template #header>
        <el-text size="large" tag="b">ADetailer</el-text>
      </template>
      <el-row>
        <el-text tag="b">ADetailer 模型</el-text>
      </el-row>
      <el-row>
        <el-text type="info">{{ showCommand.command.adetailer_model }}</el-text>
      </el-row>
      <el-row v-for="templter in showCommand.command.adetailer_lora">
        <el-card class="model">
          <template #header>
            {{ models.find(v => v.uuid === templter.uuid)?.title }} - {{ templter.version }}
          </template>
          <el-slider v-model="templter.weight" :max="2" :min="-2" :step="0.01" disabled show-input/>
        </el-card>
      </el-row>
      <el-row>
        <el-text tag="b">ADetailer 提示词</el-text>
        <el-button v-if="showCommand.command.adetailer_words.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('提示词已复制', 'success', ()=>writeText(showCommand.command.adetailer_words))"/>
      </el-row>
      <el-row>
        <el-input ref="showAdWords" :value="showCommand.command.adetailer_words" autosize disabled type="textarea"/>
      </el-row>
      <el-row>
        <el-text tag="b">ADetailer 负向提示</el-text>
        <el-button v-if="showCommand.command.adetailer_dewords.length" :icon="CopyDocument" text
                   type="info"
                   @click="messageWithEl('负向提示已复制', 'success', ()=>writeText(showCommand.command.adetailer_dewords))"/>
      </el-row>
      <el-row>
        <el-input ref="showAdDewords" :value="showCommand.command.adetailer_dewords" autosize disabled
                  type="textarea"/>
      </el-row>
    </el-card>
  </el-drawer>
</template>

<style scoped>
.card-header, .space-between {
  display: grid;
  grid-template-columns: 1fr auto
}

#shower .el-card, #shower .el-card .el-row:not(:first-child) {
  margin-top: 10px;
}

.model {
  width: 100%;
}

.models > * {
  width: 100%;
}
</style>