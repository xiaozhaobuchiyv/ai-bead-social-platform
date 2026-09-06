import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 注意：vue-devtools 在生产构建（vite build）会显著拖慢甚至卡死，仅开发模式启用
    ...(process.env.NODE_ENV === 'production' ? [] : [vueDevTools()]),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 简化配置，去掉有问题的 configure
      },
      // 上传图片走真实文件地址（/uploads/...），开发环境也要代理到后端
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    }
  },
  build: {
    // 第三方库分包，避免单 chunk 过大（企业级体积优化）
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus'],
          vendor: ['vue', 'vue-router', 'pinia', 'axios'],
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler"
      }
    }
  }
})