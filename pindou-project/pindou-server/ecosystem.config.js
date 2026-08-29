/**
 * PM2 进程管理配置
 * 用法：pm2 start ecosystem.config.js
 * 说明：cluster 模式多进程复用 CPU，--max_memory_restart 防内存泄漏拖垮进程
 */
module.exports = {
  apps: [
    {
      name: 'pindou-server',
      script: 'server.js',
      cwd: __dirname,
      instances: 'max', // 按 CPU 核数启动 cluster 实例
      exec_mode: 'cluster',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
