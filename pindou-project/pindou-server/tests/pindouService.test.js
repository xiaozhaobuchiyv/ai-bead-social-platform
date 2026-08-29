/**
 * 单元测试：拼豆图纸转换算法（服务端 jimp 引擎）
 * 运行：npm test
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const pindouService = require('../services/pindouService')

const catBuffer = () => fs.readFileSync(path.join(__dirname, 'fixtures', 'cat.jpg'))

describe('pindouService 图纸转换算法', () => {
  test('convertFromBuffer 返回合法图纸结构', async () => {
    const pattern = await pindouService.convertFromBuffer(catBuffer(), {
      gridSize: 16,
      maxColors: 0,
      options: { edgeEnhance: true, denoise: true, brightnessBoost: true },
    })
    assert.ok(pattern.gridWidth > 0 && pattern.gridHeight > 0)
    assert.equal(pattern.totalPixels, pattern.gridWidth * pattern.gridHeight)
    assert.equal(pattern.pixels.length, pattern.totalPixels)
    assert.ok(pattern.colorCount > 0)
    assert.ok(pattern.similarity >= 0 && pattern.similarity <= 100)
    // 每个像素都应是标准色号
    const codes = new Set(pindouService.PINDOU_COLORS.map((c) => c[0]))
    for (const pixel of pattern.pixels) {
      assert.ok(codes.has(pixel.code), `未知色号 ${pixel.code}`)
    }
  })

  test('maxColors 限制生效（6 色）', async () => {
    const pattern = await pindouService.convertFromBuffer(catBuffer(), {
      gridSize: 16,
      maxColors: 6,
      options: {},
    })
    assert.ok(pattern.colorCount <= 6, `颜色数 ${pattern.colorCount} 应 <= 6`)
  })

  test('网格尺寸上限与下限收敛', async () => {
    const small = await pindouService.convertFromBuffer(catBuffer(), { gridSize: 1, options: {} })
    assert.ok(small.gridWidth >= 8 && small.gridHeight >= 8)
    const big = await pindouService.convertFromBuffer(catBuffer(), { gridSize: 999, options: {} })
    assert.ok(big.gridWidth <= 128 && big.gridHeight <= 128)
  })

  test('renderPreviewPng 生成 PNG', async () => {
    const pattern = await pindouService.convertFromBuffer(catBuffer(), { gridSize: 8, options: {} })
    const png = await pindouService.renderPreviewPng(pattern, 8)
    // PNG 魔数
    assert.equal(png[0], 0x89)
    assert.equal(png[1], 0x50)
    assert.equal(png[2], 0x4e)
    assert.equal(png[3], 0x47)
  })

  test('dataUrlToBuffer 解析 base64', () => {
    const buf = pindouService.dataUrlToBuffer('data:image/png;base64,aGVsbG8=')
    assert.equal(buf.toString(), 'hello')
  })

  test('assertSafeRemoteUrl 拦截内网地址', () => {
    assert.throws(() => pindouService.assertSafeRemoteUrl('http://localhost:3000/x'))
    assert.throws(() => pindouService.assertSafeRemoteUrl('http://127.0.0.1/x'))
    assert.throws(() => pindouService.assertSafeRemoteUrl('http://192.168.1.1/x'))
    assert.doesNotThrow(() => pindouService.assertSafeRemoteUrl('https://example.com/a.png'))
  })
})
