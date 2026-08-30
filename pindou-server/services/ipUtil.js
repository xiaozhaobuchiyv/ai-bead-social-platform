/**
 * IP 归属地工具
 * 调用 ip-api.com（免费接口）查询公网 IP 归属地，失败返回空串（不影响主流程）。
 * 用途：作品详情 / 个人主页展示「IP 属地」。
 */
const axios = require('axios')

const normalizeIp = (ip) => {
  if (!ip) return ''
  const value = String(ip)
  // 去掉 IPv6 前缀与端口
  const cleaned = value.replace(/^::ffff:/, '').split(',')[0].split(':')[0].trim()
  return cleaned
}

/**
 * 根据 IP 查询归属地（省/市）
 * @param {string} ip
 * @returns {Promise<string>} 如 "江苏" / "广东"；失败或内网返回空串
 */
async function getIpRegion(ip, req = null) {
  let targetIp = normalizeIp(ip)
  if (!targetIp && req) {
    // 优先取 x-forwarded-for，其次 socket 地址
    targetIp = normalizeIp(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip)
  }
  if (!targetIp) return ''
  // 内网/本机地址不查询
  if (targetIp === '127.0.0.1' || targetIp === 'localhost' || targetIp === '::1') return '本地'
  if (/^192\.168\./.test(targetIp) || /^10\./.test(targetIp) || /^172\.(1[6-9]|2\d|3[01])\./.test(targetIp)) return ''

  try {
    const res = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(targetIp)}?lang=zh-CN&fields=status,country,regionName,city`,
      { timeout: 3000 }
    )
    if (res.data && res.data.status === 'success') {
      return res.data.regionName || res.data.city || ''
    }
    return ''
  } catch {
    return ''
  }
}

module.exports = { getIpRegion, normalizeIp }
