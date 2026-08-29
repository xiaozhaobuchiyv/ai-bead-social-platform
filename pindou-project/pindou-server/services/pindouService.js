/**
 * 拼豆图纸服务端转换引擎
 * -------------------------------------------------
 * 与前端 src/utils/pindou.js 使用同一套算法（CIE Lab 色差匹配、
 * 亮度偏好调节、重要性量化、Floyd–Steinberg 抖动），基于 jimp 实现。
 *
 * 用途：
 *   1. /api/ai/convert —— 拼小豆 AI 生成的远程图片（跨域）由服务端下载并转换
 *   2. /api/designs —— 图纸保存/预览图生成
 *
 * 纯函数设计，便于单元测试。
 */
const { Jimp } = require('jimp')
const PINDOU_COLORS = require('./pindouColors')

const colorCodeMap = new Map(PINDOU_COLORS.map(([code, hex]) => [code, { code, hex, rgb: hexToRgb(hex) }]))

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** RGB -> CIE Lab */
function rgbToLab(rgb) {
  let r = rgb[0] / 255
  let g = rgb[1] / 255
  let b = rgb[2] / 255

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

  x /= 95.047; y /= 100.0; z /= 108.883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** 最近颜色匹配 */
function findNearestColor(rgb) {
  let minDistance = Infinity
  let nearest = PINDOU_COLORS[0][0]
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3
  const lab1 = rgbToLab(rgb)

  for (const [code, entry] of colorCodeMap) {
    const colorBrightness = (entry.rgb[0] + entry.rgb[1] + entry.rgb[2]) / 3
    const lab2 = rgbToLab(entry.rgb)
    let distance = Math.sqrt(
      Math.pow(lab1[0] - lab2[0], 2) +
      Math.pow(lab1[1] - lab2[1], 2) +
      Math.pow(lab1[2] - lab2[2], 2)
    )
    if (brightness > 80 && brightness < 200) {
      if (colorBrightness < 40) distance *= 1.3
      if (colorBrightness > 240) distance *= 1.3
    }
    if (brightness < 80 && colorBrightness < 30) distance *= 1.2
    if (brightness > 200 && colorBrightness > 240) distance *= 1.2
    if (distance < minDistance) {
      minDistance = distance
      nearest = code
    }
  }
  return nearest
}

/** Floyd–Steinberg 抖动（作用于 RGBA 缓冲区） */
function applyDithering(data, width, height) {
  const temp = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const nearest = colorCodeMap.get(findNearestColor([temp[idx], temp[idx + 1], temp[idx + 2]]))
      const errR = temp[idx] - nearest.rgb[0]
      const errG = temp[idx + 1] - nearest.rgb[1]
      const errB = temp[idx + 2] - nearest.rgb[2]

      data[idx] = nearest.rgb[0]
      data[idx + 1] = nearest.rgb[1]
      data[idx + 2] = nearest.rgb[2]

      const distribute = (px, py, factor) => {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const i = (py * width + px) * 4
          temp[i] = Math.max(0, Math.min(255, temp[i] + errR * factor))
          temp[i + 1] = Math.max(0, Math.min(255, temp[i + 1] + errG * factor))
          temp[i + 2] = Math.max(0, Math.min(255, temp[i + 2] + errB * factor))
        }
      }
      distribute(x + 1, y, 7 / 16)
      distribute(x - 1, y + 1, 3 / 16)
      distribute(x, y + 1, 5 / 16)
      distribute(x + 1, y + 1, 1 / 16)
    }
  }
}

/** 颜色量化（频次 × 亮度 × 饱和度 重要性裁剪） */
function quantizeColors(pixels, maxColors, preferBright = true) {
  if (!maxColors || maxColors <= 0 || maxColors >= pixels.length) return pixels
  const colorMap = new Map()
  pixels.forEach((code) => colorMap.set(code, (colorMap.get(code) || 0) + 1))
  if (maxColors >= colorMap.size) return pixels

  const entries = Array.from(colorMap.entries())
    .map(([code, count]) => {
      const entry = colorCodeMap.get(code)
      let importance = count
      if (entry) {
        const brightness = (entry.rgb[0] + entry.rgb[1] + entry.rgb[2]) / 3
        const saturation = Math.max(...entry.rgb) - Math.min(...entry.rgb)
        if (preferBright) importance *= 1 + (brightness / 255) * 0.8
        importance *= 1 + (saturation / 255) * 0.5
      }
      return { code, importance }
    })
    .sort((a, b) => b.importance - a.importance)

  const topCodes = entries.slice(0, maxColors).map((e) => e.code)
  const mapping = new Map()
  for (const [code, entry] of colorCodeMap) {
    let minDist = Infinity
    let best = code
    const lab1 = rgbToLab(entry.rgb)
    for (const tc of topCodes) {
      const tcEntry = colorCodeMap.get(tc)
      const brightness2 = (tcEntry.rgb[0] + tcEntry.rgb[1] + tcEntry.rgb[2]) / 3
      const lab2 = rgbToLab(tcEntry.rgb)
      let dist = Math.sqrt(
        Math.pow((lab1[0] - lab2[0]) * 0.8, 2) +
        Math.pow(lab1[1] - lab2[1], 2) +
        Math.pow(lab1[2] - lab2[2], 2)
      )
      if (preferBright && brightness2 > (entry.rgb[0] + entry.rgb[1] + entry.rgb[2]) / 3) dist *= 0.95
      if (dist < minDist) {
        minDist = dist
        best = tc
      }
    }
    mapping.set(code, best)
  }
  return pixels.map((code) => mapping.get(code) || code)
}

/** 平均 ΔE 相似度 */
function calculateSimilarity(originalPixels, codePixels) {
  let totalDeltaE = 0
  for (let i = 0; i < originalPixels.length; i++) {
    const lab1 = rgbToLab(originalPixels[i])
    const entry = colorCodeMap.get(codePixels[i])
    const lab2 = rgbToLab(entry.rgb)
    totalDeltaE += Math.sqrt(
      Math.pow(lab1[0] - lab2[0], 2) +
      Math.pow(lab1[1] - lab2[1], 2) +
      Math.pow(lab1[2] - lab2[2], 2)
    )
  }
  const avg = totalDeltaE / originalPixels.length
  return Math.max(0, Math.min(100, Math.round(100 - (avg / 12) * 100)))
}

/**
 * 核心转换
 * @param {Buffer} buffer 图片二进制
 * @param {object} opts { gridSize, maxColors, options: { edgeEnhance, denoise, brightnessBoost, dithering } }
 */
async function convertFromBuffer(buffer, opts = {}) {
  // 防御纵深：服务层独立钳制尺寸（路由层也会校验）
  const gridSize = Math.max(8, Math.min(128, parseInt(opts.gridSize, 10) || 24))
  const maxColors = parseInt(opts.maxColors, 10) || 0
  const options = opts.options || {}

  let image = await Jimp.read(buffer)

  const imgRatio = image.width / image.height
  let gridWidth, gridHeight
  if (imgRatio > 1) {
    gridWidth = gridSize
    gridHeight = Math.round(gridSize / imgRatio)
  } else {
    gridHeight = gridSize
    gridWidth = Math.round(gridSize * imgRatio)
  }
  // 最小网格钳制（与前端一致）
  gridWidth = Math.max(8, gridWidth)
  gridHeight = Math.max(8, gridHeight)

  const processWidth = Math.max(gridWidth, 128)
  const processHeight = Math.max(gridHeight, 128)

  await image.resize({ w: processWidth, h: processHeight })

  if (options.brightnessBoost) {
    // 注意：jimp 的 brightness(val) 在本版本会把像素乘上 val（即变暗 8% 而不是提亮），
    // 因此这里手动做「×1.08 并钳制 255」，与前端 Canvas 引擎保持一致。
    const bd = image.bitmap.data
    for (let i = 0; i < bd.length; i += 4) {
      bd[i] = Math.min(255, bd[i] * 1.08)
      bd[i + 1] = Math.min(255, bd[i + 1] * 1.08)
      bd[i + 2] = Math.min(255, bd[i + 2] * 1.08)
    }
  }
  if (options.denoise) {
    await image.gaussian(1)
  }
  if (options.edgeEnhance) {
    await image.convolution([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
  }

  if (gridWidth !== processWidth || gridHeight !== processHeight) {
    await image.resize({ w: gridWidth, h: gridHeight })
  }

  // 读取像素
  const { data, width, height } = image.bitmap
  const originalPixels = []
  const matchedCodes = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      originalPixels.push([r, g, b])
      matchedCodes.push(a < 128 ? 'T1' : findNearestColor([r, g, b]))
    }
  }

  // 抖动需在量化前处理（保持与前端顺序一致：前端先 dither 再量化）
  let codePixels = matchedCodes
  if (options.dithering) {
    // 前端抖动作用于原始 RGB 并直接得到匹配色；这里用近似实现（在原始像素上抖动）
    const workData = new Uint8ClampedArray(data)
    applyDithering(workData, width, height)
    codePixels = []
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4
      codePixels.push(findNearestColor([workData[idx], workData[idx + 1], workData[idx + 2]]))
    }
  }

  const quantized = quantizeColors(codePixels, maxColors, true)

  // 统计色板
  const paletteMap = new Map()
  quantized.forEach((code) => {
    if (!paletteMap.has(code)) {
      const entry = colorCodeMap.get(code)
      paletteMap.set(code, { code, name: code, color: entry.hex, rgb: entry.rgb })
    }
  })

  const palette = Array.from(paletteMap.values())
  const similarity = calculateSimilarity(originalPixels, quantized)

  return {
    gridWidth: width,
    gridHeight: height,
    totalPixels: width * height,
    colorCount: palette.length,
    estimatedTime: `${Math.round((width * height) / 400)}小时`,
    similarity,
    palette,
    pixels: quantized.map((code) => {
      const entry = colorCodeMap.get(code)
      return { code, name: code, color: entry.hex, rgb: entry.rgb }
    }),
  }
}

/** 生成图纸预览 PNG（网格 + 色块 + 边框） */
async function renderPreviewPng(pattern, cellSize = 18) {
  const { gridWidth: w, gridHeight: h } = pattern
  const canvas = new Jimp({ width: w * cellSize, height: h * cellSize, color: 0xffffffff })

  // 色块
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixel = pattern.pixels[y * w + x]
      const hex = pixel.color.replace('#', '')
      const colorInt = parseInt(hex, 16)
      canvas.scan(x * cellSize, y * cellSize, cellSize, cellSize, (_px, _py, idx) => {
        canvas.bitmap.data[idx] = (colorInt >> 16) & 0xff
        canvas.bitmap.data[idx + 1] = (colorInt >> 8) & 0xff
        canvas.bitmap.data[idx + 2] = colorInt & 0xff
        canvas.bitmap.data[idx + 3] = 0xff
      })
    }
  }

  // 网格线：全图单次扫描，命中网格坐标则画线
  const gridLines = new Set()
  for (let i = 0; i <= w; i++) gridLines.add(i * cellSize)
  for (let i = 0; i <= h; i++) gridLines.add(i * cellSize)

  canvas.scan(0, 0, canvas.width, canvas.height, (x, y, idx) => {
    if (gridLines.has(x) || gridLines.has(y)) {
      canvas.bitmap.data[idx] = 0
      canvas.bitmap.data[idx + 1] = 0
      canvas.bitmap.data[idx + 2] = 0
    }
  })

  return canvas.getBuffer('image/png')
}

/** 校验并解析 dataURL */
function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new Error('无效的 dataURL')
  return Buffer.from(m[2], 'base64')
}

/** 校验远程 URL（基础 SSRF 防护：仅允许 http/https，禁止内网地址） */
function assertSafeRemoteUrl(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 图片地址')
  try {
    const { hostname } = new URL(url)
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.local')
    if (isPrivate) throw new Error('不允许访问内网地址')
  } catch (e) {
    if (e.message === '不允许访问内网地址') throw e
    throw new Error('图片地址不合法')
  }
}

module.exports = {
  PINDOU_COLORS,
  convertFromBuffer,
  renderPreviewPng,
  dataUrlToBuffer,
  assertSafeRemoteUrl,
  findNearestColor,
}
