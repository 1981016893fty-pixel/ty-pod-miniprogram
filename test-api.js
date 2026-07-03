/**
 * API 功能测试脚本
 * 测试 ty-music.onrender.com 的搜索和播放接口
 * 用法: node test-api.js
 */
const https = require('https')

const BASE = 'https://ty-music.onrender.com'
const TIMEOUT = 25000

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const start = Date.now()
    const req = https.get(url, { timeout: TIMEOUT }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        const elapsed = Date.now() - start
        resolve({ statusCode: res.statusCode, headers: res.headers, data, elapsed })
      })
    })
    req.on('error', (err) => reject(err))
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function test() {
  console.log('=== TY Pod API 测试 ===')
  console.log('目标: ' + BASE)
  console.log('')

  // 1. 健康检查（预热）
  console.log('[1/4] Health Check (预热)...')
  try {
    const r = await get('/api/health')
    console.log(`  ✓ 状态: ${r.statusCode} (${r.elapsed}ms)`)
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}`)
  }

  // 等 1s 确保服务就绪
  await new Promise(r => setTimeout(r, 1000))

  // 2. 搜索测试
  console.log('\n[2/4] 搜索测试 — 关键词: "周杰伦"')
  try {
    const r = await get('/api/music/search?keywords=' + encodeURIComponent('周杰伦') + '&limit=5')
    console.log(`  ✓ 状态: ${r.statusCode} (${r.elapsed}ms)`)
    let json = r.data
    try {
      if (typeof json === 'string') json = JSON.parse(json)
      const songs = json?.songs || []
      console.log(`  ✓ 返回 ${songs.length} 首歌:`)
      songs.slice(0, 5).forEach((s, i) => {
        console.log(`    ${i+1}. ${s.name || s.title} — ${s.artist || (s.ar?.[0]?.name)} [${s.id || s.songId}]`)
      })
      if (songs.length > 0) {
        // 保存第一首歌 ID 用于播放测试
        global.testSongId = songs[0].id || songs[0].songId
      }
    } catch (e) {
      console.log(`  ✗ JSON 解析失败: ${r.data.substring(0, 200)}`)
    }
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}`)
  }

  // 3. 播放地址测试
  if (global.testSongId) {
    console.log(`\n[3/4] 播放地址测试 — songId: ${global.testSongId}`)
    try {
      const r = await get('/api/play?id=' + global.testSongId)
      console.log(`  ✓ 状态: ${r.statusCode} (${r.elapsed}ms)`)
      let json = r.data
      try {
        if (typeof json === 'string') json = JSON.parse(json)
        const url = json?.url
        console.log(`  ✓ 播放URL: ${url ? url.substring(0, 80) + '...' : '(无)'}`)
        if (url) {
          global.audioUrl = url.startsWith('http') ? url : BASE + url
        }
      } catch (e) {
        console.log(`  ✗ JSON 解析失败: ${r.data.substring(0, 200)}`)
      }
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`)
    }
  }

  // 4. 音频资源可达性 + Content-Type 检查
  if (global.audioUrl) {
    console.log(`\n[4/4] 音频资源检查 — HEAD 请求`)
    const audioUrl = global.audioUrl + (global.audioUrl.includes('?') ? '&' : '?') + 'stream=1'
    console.log(`  URL: ${audioUrl.substring(0, 80)}...`)
    try {
      const url = new URL(audioUrl)
      const r = await new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
          resolve({ statusCode: res.statusCode, headers: res.headers })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
        req.end()
      })
      console.log(`  ✓ 状态: ${r.statusCode}`)
      console.log(`  ✓ Content-Type: ${r.headers['content-type'] || '(无)'}`)
      console.log(`  ✓ Content-Length: ${r.headers['content-length'] || '(无)'}`)
      const ct = r.headers['content-type'] || ''
      if (ct.includes('charset') && ct.includes('audio')) {
        console.log(`  ⚠  Content-Type 含 charset 后缀，InnerAudioContext 可能无法直接播放`)
        console.log(`      此时将自动回退到下载模式（_downloadAndPlay）`)
      } else if (ct.startsWith('audio/')) {
        console.log(`  ✓ Content-Type 正常，InnerAudioContext 可直接流式播放`)
      }
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`)
    }
  }

  console.log('\n=== 测试完成 ===')
}

test().catch(console.error)
