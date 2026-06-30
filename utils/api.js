// utils/api.js - TY Music 后端 API 封装

const BASE = 'https://ty-music.onrender.com/api'

/**
 * 搜索歌曲
 */
function search(keyword, limit = 20) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/search`,
      data: { keywords: keyword, limit },
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.songs) {
          resolve(res.data.songs)
        } else {
          reject(new Error(res.data?.msg || '搜索无结果'))
        }
      },
      fail: reject,
    })
  })
}

/**
 * 获取歌曲详情（含播放 URL、歌词等）
 */
function getSongDetail(id) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/detail`,
      data: { id },
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.msg || '获取详情失败'))
        }
      },
      fail: reject,
    })
  })
}

/**
 * 获取歌词
 */
function getLyric(id) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/lyric`,
      data: { id },
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 200 && (res.data?.lrc || res.data?.lyric)) {
          resolve(res.data.lrc || res.data.lyric)
        } else {
          reject(new Error('暂无歌词'))
        }
      },
      fail: reject,
    })
  })
}

/**
 * 获取热门歌曲列表
 */
function getHotSongs(limit = 50) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/hot`,
      data: { limit },
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.songs) {
          resolve(res.data.songs)
        } else {
          reject(new Error(res.data?.msg || '加载失败'))
        }
      },
      fail: reject,
    })
  })
}

/**
 * 获取歌曲播放 URL
 */
function getSongUrl(id) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE}/play`,
      data: { id },
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.url) {
          const raw = res.data.url
          let full = raw.startsWith('http') ? raw : `${BASE.replace('/api', '')}${raw}`
          // 小程序需要服务器流式代理，绕过域名白名单
          full += (full.includes('?') ? '&' : '?') + 'stream=1'
          resolve(full)
        } else {
          reject(new Error('获取播放地址失败'))
        }
      },
      fail: reject,
    })
  })
}

module.exports = {
  search,
  getSongDetail,
  getLyric,
  getHotSongs,
  getSongUrl,
}
