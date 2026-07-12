<script lang="ts" setup>
import {ElContainer, ElHeader, ElMain, ElMenu, ElMenuItem} from 'element-plus'
import {onBeforeMount, onUnmounted, ref} from "vue";
import {Hide, View} from "@element-plus/icons-vue";
import {useNSFWStore} from './store/nsfwStore.ts';
import emitter from "./mitt.ts";

const nsfwStore = useNSFWStore()

const scrollBar = ref()
const scrollToTop = () => {
  scrollBar.value.setScrollTop(0)
}

onBeforeMount(() => {
  emitter.on("scroll-to-top", scrollToTop);
})

onUnmounted(() => {
  emitter.off("scroll-to-top", scrollToTop);
})
</script>

<template>
  <el-drawer v-model="nsfwStore.show" append-to="#app" direction="ttb" @mouseleave="nsfwStore.show = false">
    <el-switch
        v-model="nsfwStore.enable"
        :active-action-icon="View"
        :inactive-action-icon="Hide"
    />
    <el-rate v-model="nsfwStore.rate" :colors="['#4CAF50','#FF9800','#C62828']" clearable/>
  </el-drawer>
  <el-container id="container">
    <el-header>
      <el-menu mode="horizontal" router>
        <el-menu-item index="/templater">帖子</el-menu-item>
        <el-menu-item index="/command">提示词</el-menu-item>
        <el-menu-item index="/model">模型</el-menu-item>
        <el-menu-item index="/tool">TOOLS</el-menu-item>
      </el-menu>
    </el-header>
    <el-main>
      <Suspense>
        <el-scrollbar ref="scrollBar">
          <router-view/>
        </el-scrollbar>
      </Suspense>
    </el-main>
  </el-container>
</template>

<style>
html, body, #app, .el-container {
  height: 100%;
  margin: 0;
  padding: 0;
}

.el-main {
  overflow-y: auto;
}

.el-footer {
  width: 100%;
}

.el-footer > .el-pagination {
  justify-content: center;
}

.el-card .el-card__body {
  padding: 1em;
}

.el-card .el-card__body:has(> span.hide) {
  display: none;
}

.el-card:has(.el-card__body > span.hide) .el-card__header {
  border-bottom: none;
}

.el-card .el-card__header {
  padding: 1em;
}

.el-card .el-card__header .card-header {
  font-weight: bold;
  font-size: 1.5em;
}

.card-header {
  display: flex; /* 启用Flex布局 */
  justify-content: space-between;
  align-items: center; /* 垂直居中 */
  gap: 8px; /* 元素间间距 */
  width: 100%; /* 确保容器宽度 */
}

.card-header > span:nth-child(1) {
  flex: 1; /* 占据剩余空间 */
  overflow: hidden; /* 隐藏溢出内容 */
  text-overflow: ellipsis; /* 显示省略号 */
  white-space: nowrap; /* 禁止文本换行 */
  min-width: 50px; /* 设置最小宽度（可选） */
}

.card-header > span:nth-child(2) {
  flex-shrink: 0; /* 禁止按钮区域收缩 */
  display: flex; /* 确保按钮水平排列 */
}

.el-card .el-card__footer {
  padding: 6px 8px;
}

.el-divider.el-divider--horizontal {
  margin: .5em 0;
}

.full-width {
  width: 100%;
}

.el-main:has(.el-main) .el-scrollbar__view > .el-button {
  /*margin: 0 20px;*/
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 9;
}

.el-form {
  display: grid;
  row-gap: 10px;
}

.el-form .el-card :is(.el-card__body, .el-col) {
  display: grid;
  row-gap: 10px;
}
</style>

<style>
@property --vw {
  syntax: '<length>';
  inherits: true;
  initial-value: 100vw;
}

:root {
  --w: round(tan(atan2(var(--vw), 500px)));
}
</style>

<style>
:is(.bracketed-value, .commented-value):nth-child(4n+1) {
  --color: #845ec2;
}

:is(.bracketed-value, .commented-value):nth-child(4n+2) {
  --color: #ff6f91;
}

:is(.bracketed-value, .commented-value):nth-child(4n+3) {
  --color: #0081cf;
}

:is(.bracketed-value, .commented-value):nth-child(4n+4) {
  --color: #008f7a;
}

:is(.bracketed-value, .commented-value) {
  border: 2px solid var(--color);
  border-radius: .5em;
  color: var(--color);
  padding: .25ch .5ch;
  margin: 0 .5ch;
  font-weight: bold;
}

.commented-value.empty {
  --color: gray;
}

.commented-value > rt {
  ruby-align: center;
  font-size: 85%;
  text-shadow: #fff 1px 1px 0, #fff -1px 1px 0, #fff -1px -1px 0, #fff 1px -1px 0;
}

.main {
  column-count: var(--w); /* 设置列数 */
  gap: 20px; /* 设置列间距 */
}

main.main {
  padding: var(--el-main-padding) 0;
}

.main > .el-card {
  width: 100%;
  break-inside: avoid; /* 防止元素被截断分列显示 */
  margin-bottom: 20px; /* 保留元素间距 */
}

main.el-main {
  overflow: visible;
}

main.main.el-main {
  padding-right: 2px;
}
</style>

<style>
.el-drawer.ttb {
  height: auto !important;
}

.el-drawer.ttb > .el-drawer__body {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
}
</style>

<style>
div[role="dialog"]::-webkit-scrollbar {
  display: none;
}
</style>

<style>
div[class*="el-scrollbar"]:not([class*="el-select"]) {
  overflow: visible;
}
</style>

<style scoped>
.el-scrollbar {
  overflow: visible;
}
</style>