<script lang="ts" setup>
import {computed, onMounted, onUnmounted, provide, Ref, ref, watch} from "vue";
import {db} from "../database";
import {Templater} from "../types/templater.ts";
import {ElMessage, ElMessageBox} from 'element-plus'
import {liveQuery, Subscription} from "dexie";
import {Model} from "../types/model.ts";
import {useNSFWStore} from '../store/nsfwStore.ts';
import emitter from "../mitt.ts";
import {Version} from "../types/version.ts";
import TemplaterCard from "../components/TemplaterCard.vue";
import DraggableInputTag from "../components/DraggableInputTag.vue";
import {debounce} from "../utils.ts";

const nsfwStore = useNSFWStore()
const recentPage = ref(1)

const filters = ref('')
const debouncedFilters = ref('')
const templaters: Ref<Templater[]> = ref([])
let templaters_subscription: Subscription | null = null

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
  if (keywords.length === 0) return templaters.value
  return templaters.value.filter(val => {
    const text = JSON.stringify(val).toLowerCase()
    return keywords.every(k => text.includes(k))
  })
})
const pageTemplaters = computed(() => filted.value.slice((recentPage.value - 1) * 20, Math.min(recentPage.value * 20, filted.value.length)))

const models: Ref<Model[]> = ref([])
let models_subscription: Subscription | null = null
provide('models', models)

const newTemplater = () => {
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
        const newValue = new Templater(value)
        newValue.versions.push(new Version())
        db.templaters.add(newValue)
      })
      .catch((e) => {
        ElMessage({
          type: 'info',
          message: 'Input canceled: ' + e.message,
        })
        console.error(e)
      })
}

onMounted(() => {
  templaters_subscription = liveQuery(() => db.templaters.toArray())
      .subscribe({
        next: (result) => {
          templaters.value = result.sort((a, b) => a.date < b.date ? 1 : -1)
        }
      })
  models_subscription = liveQuery(() => db.models.toArray())
      .subscribe({
        next: (result) => {
          models.value = result
        }
      })
  recentPage.value = Number(sessionStorage.getItem("templaterPage") ?? 1)
  const saved = sessionStorage.getItem("templaterFilters")
  try {
    const parsed = saved ? JSON.parse(saved) : null
    filters.value = Array.isArray(parsed) ? parsed.join(' ') : (saved ?? '')
  } catch {
    filters.value = saved ?? ''
  }
})

onUnmounted(() => {
  templaters_subscription?.unsubscribe()
  models_subscription?.unsubscribe()
  sessionStorage.setItem("templaterPage", String(recentPage.value))
  sessionStorage.setItem("templaterFilters", JSON.stringify(filters.value))
})
</script>

<template>
  <el-button type="primary" @click="newTemplater" @mouseleave="nsfwStore['cancel']" @mouseover="nsfwStore['load']">ADD
  </el-button>
  <el-input v-model="filters" placeholder="输入关键词，空格分隔" size="large" clearable style="margin-top: 10px;"/>
  <el-main class="main">
    <templater-card v-for="templater in pageTemplaters" :key="templater.uuid" :templater="templater"/>
  </el-main>
  <el-footer>
    <el-pagination v-model:current-page="recentPage" :page-count="Math.ceil(filted.length/20)"
                   background layout="prev, pager, next" size="large" @change="emitter.emit('scroll-to-top')"/>
  </el-footer>
</template>

<style scoped>
</style>