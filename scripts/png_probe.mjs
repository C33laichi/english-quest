/**
 * 零依赖 PNG 像素采样器
 *
 * 为什么需要它：肉眼+缩略图判断"这张截图是深色还是浅色"极不可靠
 * （Read 工具会缩放图片，深色卡片的细边、渐变会被看成浅色）。
 * 本脚本直接解 PNG 像素，给出精确 RGB 与相对亮度，用于**定量**判定主题。
 *
 * 只支持 Chrome Page.captureScreenshot 产出的 PNG：8bit、colorType 6 (RGBA)，
 * 或 colorType 2 (RGB)。其它类型直接报错，不做猜测。
 *
 * 用法：
 *   node scripts/png_probe.mjs <图片> [x比例,y比例 ...]
 *   node scripts/png_probe.mjs screenshots/35-x.png 0.5,0.55 0.75,0.3
 */

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('不是 PNG 文件')

  let off = 8
  let ihdr = null
  const idat = []

  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  if (!ihdr) throw new Error('缺少 IHDR')
  if (ihdr.bitDepth !== 8) throw new Error(`只支持 8bit，实际 ${ihdr.bitDepth}`)
  if (ihdr.interlace !== 0) throw new Error('不支持隔行扫描')
  const channels = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : 0
  if (!channels) throw new Error(`只支持 colorType 6/2，实际 ${ihdr.colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const { width, height } = ihdr
  const stride = width * channels
  const out = Buffer.alloc(stride * height)

  // 逐扫描线反滤波（PNG 规范 9.2）
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      const v = src[x]
      let val
      switch (filter) {
        case 0: val = v; break
        case 1: val = v + a; break
        case 2: val = v + b; break
        case 3: val = v + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error(`未知滤波类型 ${filter} @ row ${y}`)
      }
      cur[x] = val & 0xff
    }
  }

  return { width, height, channels, pixels: out }
}

export function srgbToLin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export function luminance(r, g, b) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b)
}

/** 取某个像素（越界时返回 null），供其它脚本直接采样截图用 */
export function pixelAt(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null
  const i = (y * img.width + x) * img.channels
  return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]]
}

/*
 * CLI 部分只在直接执行本文件时运行。
 * 被其它脚本 import 时不应触发（否则会把采样结果打印到别人的输出里，也会多读一次文件）。
 */
const isDirectRun = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop())

if (isDirectRun) {
  const [file, ...pointArgs] = process.argv.slice(2)
  if (!file) {
    console.error('用法: node scripts/png_probe.mjs <图片> [x比例,y比例 ...]')
    process.exit(2)
  }

  const img = decodePng(readFileSync(file))
  const points = pointArgs.length ? pointArgs : ['0.5,0.55', '0.75,0.30', '0.50,0.90']

  console.log(`${file}`)
  console.log(`  尺寸 ${img.width}x${img.height}  channels=${img.channels}`)

  for (const p of points) {
    const [fx, fy] = p.split(',').map(Number)
    const x = Math.min(img.width - 1, Math.round(fx * img.width))
    const y = Math.min(img.height - 1, Math.round(fy * img.height))
    const [r, g, b] = pixelAt(img, x, y)
    const L = luminance(r, g, b)
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    console.log(`  (${fx},${fy}) → (${x},${y})  rgb(${r},${g},${b})  ${hex}  L=${L.toFixed(4)}  ${L < 0.18 ? '暗' : '亮'}`)
  }
}
