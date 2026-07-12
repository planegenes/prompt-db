import {createRouter, createWebHashHistory} from "vue-router";
import {invoke} from "@tauri-apps/api/core";
import TheTemplaterPage from "./pages/TheTemplaterPage.vue";
import TheCommandPage from "./pages/TheCommandPage.vue";
import TheModelPage from "./pages/TheModelPage.vue";
import TheToolPage from "./pages/TheToolPage.vue";

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: "/",
            redirect: "/templater"
        },
        {
            path: "/templater",
            component: TheTemplaterPage
        },
        {
            path: "/command",
            component: TheCommandPage
        },
        {
            path: "/model",
            component: TheModelPage
        },
        {
            path: "/tool",
            component: TheToolPage
        },
    ]
});

// 切换页面时清理图片缓存，保留最近 200 个文件
router.afterEach(() => {
    invoke('clean_image_cache', {maxCount: 200}).catch(console.error)
})

export default router