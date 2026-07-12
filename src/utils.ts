import {ElMessage, ElMessageBox} from "element-plus";
import {invoke} from "@tauri-apps/api/core";

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 处理双模板格式：
 * 1. [[text{comment}]] → <ruby>text<rt>comment</rt></ruby>
 * 2. [[text]] → <ruby class="empty">text</ruby>
 * 3. {{value}} → <span class="bracketed-value">value</span>
 */
export function processTemplates(input: string): string {
    // 先处理 [[...]] 格式
    const rubyProcessed = input.replace(new RegExp('\n', 'gm'), '<br/>').replace(/\[\[(.*?)\]\]/g, (_, content) => {
        // 检查是否有 {comment} 部分
        const hasComment = /^(.*)\{(.*)\}$/.test(content);

        if (hasComment) {
            // 提取 text 和 comment
            const match = content.match(/^(.*)\{(.*)\}$/);
            if (match) {
                const text = escapeHtml(match[1]);
                const comment = escapeHtml(match[2]);
                return `<ruby class="commented-value">${text}<rt>${comment}</rt></ruby>`;
            }
        }

        // 没有注释部分
        const text = escapeHtml(content);
        return `<ruby class="commented-value empty">${text}</ruby>`;
    });

    // 再处理 {{...}} 格式
    return rubyProcessed.replace(/\{\{(.*?)\}\}/g, (_, value) => {
        const escapedValue = escapeHtml(value);
        return `<span class="bracketed-value">{{ ${escapedValue.trim()} }}</span>`;
    });
}

export function processTemplatesPlain(input: string): string {
    if (!input || input.length === 0) return ""
    // 处理换行符和[[...]]模板
    return input
        .replace(/\[\[(.*?)\]\]/g, (_, content) => {
            // 分割text和comment（如果有的话）
            const parts = content.split('{');
            // 只取第一个部分（text部分），并进行HTML转义
            return parts[0].trim();
        })
        // 完全移除{{...}}部分
        .replace(/\{\{.*?\}\}/g, '');
}

export const handleClose = (done: () => void, msg: string = 'Are you sure to close this dialog?') => {
    ElMessageBox.confirm(msg)
        .then(() => {
            done()
        })
        .catch(() => {
            // catch error
        })
}

/**
 * 获取远程图片宽高（通过 URL）
 * @param url 图片链接
 */
export function getImageSizeFromUrl(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image()

        // 处理跨域图片（若后端允许）
        img.crossOrigin = 'anonymous'
        img.src = url

        img.onload = () => {
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            })
        }

        img.onerror = () => {
            reject(new Error(`图片加载失败：${url}`))
        }
    })
}


// 任务队列和并发控制
const taskQueue: (() => Promise<void>)[] = [];
let activeTasks = 0;
const MAX_CONCURRENT_TASKS = 1; // 设置为1确保同一时间只有一个任务在执行

/**
 * 处理任务队列
 */
const processQueue = () => {
    // 队列为空或达到最大并发数时停止
    if (taskQueue.length === 0 || activeTasks >= MAX_CONCURRENT_TASKS) return;

    // 从队列中取出任务执行
    activeTasks++;
    const task = taskQueue.shift()!;

    task().finally(() => {
        activeTasks--;
        processQueue(); // 处理下一个任务
    });
};

/**
 * 获取本地图片尺寸（带队列控制）
 * @param filePath 图片绝对路径
 * @returns 图片尺寸对象 { width, height }
 */
export const getImageSize = async (
    filePath: string
): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        // 将任务添加到队列
        taskQueue.push(async () => {
            try {
                const size: [number, number] = await invoke('get_image_size', {
                    path: filePath,
                });
                resolve({width: size[0], height: size[1]});
            } catch (error) {
                console.error('获取图片尺寸失败:', error);
                reject(new Error(`无法获取图片尺寸: ${error}`));
            }
        });

        // 触发队列处理
        processQueue();
    });
};

/**
 * 批量获取图片尺寸（自动排队）
 * @param paths 图片路径数组
 * @returns 尺寸结果数组
 */
export const getBatchImageSizes = async (
    paths: string[]
): Promise<{ width: number; height: number }[]> => {
    const results: { width: number; height: number }[] = [];

    // 创建所有任务的Promise
    const promises = paths.map(path =>
        getImageSize(path)
            .then(size => results.push(size))
            .catch(error => {
                console.error(`图片 ${path} 处理失败:`, error);
                return {width: 0, height: 0}; // 返回默认值避免中断
            })
    );

    await Promise.all(promises);
    return results;
};

export const messageWithEl = async (theMessage: string, theType: string, fun: () => Promise<any>) => {
    // @ts-ignore
    ElMessage({message: theMessage, type: theType, plain: true})
    await fun()
}

/**
 * 获取本地图片调整大小后的缓存路径。
 *
 * `mode` 语义同 CSS `background-size`：
 * - `"cover"`：短边对齐 `size`，填满目标区域，超出部分被裁剪。
 * - `"contain"`：长边对齐 `size`，图片完整显示，可能有留白。
 *
 * @param filePath 图片绝对路径
 * @param size 目标尺寸
 * @param mode 缩放模式
 * @returns 调整后图片的绝对路径
 */
export const getResizedImage = async (
    filePath: string,
    size: number,
    mode: 'cover' | 'contain' = 'contain'
): Promise<string> => {
    return await invoke('get_resized_image', {
        path: filePath,
        size,
        mode,
    });
}

/**
 * 通用防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number = 200
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}