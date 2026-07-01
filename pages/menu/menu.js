// pages/menu/menu.js — TY Pod iPod Classic
const app = getApp()

const VIEW_TITLES = {
  menu:        '',
  onlinemusic: 'Music',
  localmusic:  'Local',
  search:      'Search',
  hot:         'Hot Picks',
  nowplaying:  'Now Playing',
  coverflow:   'Cover Flow',
  albumsongs:  'Album',
  settings:    'Settings',
}

Page({
  data: {
    /* ——— 主题 ——— */
    bodyColor:  'silver',
    themeVars:  '',

    /* ——— 导航 ——— */
    viewStack:   ['menu'],
    currentView: 'menu',
    viewTitle:   '',

    /* ——— 菜单 ——— */
    menuIndex:     0,
    subMenuIndex:  0,
    settingsIndex: 0,

    /* ——— 搜索 ——— */
    searchKeyword: '',
    searchResults: [],

    /* ——— 歌单 ——— */
    playlist: [],
    localSongs: [],

    /* ——— 正在播放 ——— */
    playSong:          null,
    currentSong:       null,
    playing:           false,
    currentTime:       0,
    duration:          0,
    currentTimeFmt:    '00:00',
    durationFmt:       '00:00',
    loadingSong:       false,
    lyrics:            [],
    lyricActiveIdx:    0,
    currentLyricText:  '',

    /* ——— 设置 ——— */
    playMode:      0,
    playModeLabel: '顺序',
    backlight:     true,

    /* ——— CoverFlow ——— */
    cfActiveIdx: 0,
    coverFlowData: [],

    /* ——— 专辑歌曲列表 ——— */
    albumSongs: [],
    albumName: '',
    albumCover: '',

    /* ——— 收藏 ——— */
    favorites: [],
    favIds: [],

    /* ——— 状态 ——— */
    _networkErrorShown: false,
    playlistLoaded: false,
    wheelScrollTarget: '',

    /* ——— 凯斯哈林背景轮播 ——— */
    bgIndex: 0,
    bgImages: [
      '/static/bg/bg1.png',
      '/static/bg/bg2.png',
      '/static/bg/bg3.png',
      '/static/bg/bg4.png',
      '/static/bg/bg5.png',
      '/static/bg/bg6.png',
    ],
  },

  onLoad() {
    this._initTheme()
    this._loadPlaylist()
    this._loadLocalSongs()
    this._loadFavorites()
    this._restoreState()
    this._queryWheelCenter()
    this._startBgRotation()
  },

  /* 动态获取轮盘中心坐标，用于准确计算圆周滑动角度 */
  _queryWheelCenter() {
    setTimeout(() => {
      wx.createSelectorQuery()
        .select('.ipod-wheel')
        .boundingClientRect((rect) => {
          if (rect) {
            this._wheelCenter = {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            }
          }
        })
        .exec()
    }, 600)
  },

  onShow() {
    const p = app.globalData.player
    if (p?.currentSong) {
      this.setData({
        currentSong: p.currentSong,
        playing: p.playing || false,
        currentTime: p.currentTime || 0,
        currentTimeFmt: this._fmtSec(p.currentTime || 0),
        playSong: p.currentSong,
      })
    }
    this._queryWheelCenter()
    /* 回到前台：检查是否已过3分钟，过了立即换，然后重新计时 */
    if (this._bgLastChange) {
      const elapsed = Date.now() - this._bgLastChange
      if (elapsed >= 3 * 60 * 1000) {
        const next = (this.data.bgIndex + 1) % this.data.bgImages.length
        this.setData({ bgIndex: next })
      }
      clearInterval(this._bgTimer)
      this._startBgRotation()
    }
  },

  onHide() {
    if (this._bgTimer) { clearInterval(this._bgTimer); this._bgTimer = null }
  },

  /* ============ 主题 ============ */
  _initTheme() {
    const c = app.globalData.bodyColor || 'silver'
    this.setData({ bodyColor: c, themeVars: app.getThemeCSSVars(c) })
  },

  /* ============ 状态恢复 ============ */
  _restoreState() {
    try {
      const s = wx.getStorageSync('typod_state')
      if (!s) return
      const labels = ['顺序','随机','单曲循环']
      this.setData({
        bodyColor:     s.bodyColor || 'silver',
        playMode:      s.playMode ?? 0,
        playModeLabel: labels[s.playMode ?? 0],
        backlight:     s.backlight !== false,
      })
      app.globalData.bodyColor = s.bodyColor || 'silver'
      app.globalData.playMode  = s.playMode ?? 0
      this._initTheme()
    } catch (_) {}
  },

  _saveState() {
    wx.setStorage({ key: 'typod_state', data: {
      bodyColor: this.data.bodyColor,
      playMode:  this.data.playMode,
      backlight: this.data.backlight,
    }})
  },

  /* ============ 收藏 ============ */
  _loadFavorites() {
    try {
      const favs = wx.getStorageSync('typod_favs') || []
      const favIds = favs.map(f => f.id)
      this.setData({ favorites: favs, favIds })
      app.globalData.favorites = favs
      this._updateCoverFlow()
    } catch (_) {}
  },

  _isFavorited(songId) {
    return this.data.favorites.some(f => f.id === songId)
  },

  toggleFavorite(e) {
    const idx = +e.currentTarget.dataset.idx
    let song
    const v = this.data.currentView
    if (v === 'search') song = this.data.searchResults[idx]
    else if (v === 'hot') song = this.data.playlist[idx]
    else if (v === 'localmusic') song = this.data.localSongs[idx]
    else if (v === 'nowplaying') song = this.data.currentSong
    if (!song || !song.id) return

    let favs = [...this.data.favorites]
    const existIdx = favs.findIndex(f => f.id === song.id)
    if (existIdx >= 0) {
      favs.splice(existIdx, 1)
      wx.showToast({ title: '已取消收藏', icon: 'none', duration: 800 })
    } else {
      favs.push({
        id: song.id,
        name: song.name,
        artist: song.artist,
        cover: song.cover,
        album: song.album || song.name,
      })
      wx.showToast({ title: '已收藏', icon: 'none', duration: 800 })
      wx.vibrateShort({ type: 'medium' }).catch(() => {})
    }
    this.setData({ favorites: favs })
    app.globalData.favorites = favs
    wx.setStorageSync('typod_favs', favs)
    const favIds = favs.map(f => f.id)
    this.setData({ favIds })
    this._updateCoverFlow()
  },

  /* ============ CoverFlow 数据 ============ */
  _updateCoverFlow() {
    const { playlist, favorites } = this.data

    // 1. 从热门歌单中按专辑聚合（每个专辑取第一首封面 + picId）
    const albumMap = new Map()
    for (const s of playlist) {
      const key = s.album || s.name
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          id: 'pl_' + key,
          name: key,
          artist: s.artist,
          cover: s.cover || '/static/default-cover.png',
          source: 'playlist',
          songs: [],
          picId: s.picId || '',       // 同一专辑 picId 相同
          albumId: s.albumId || '',    // 网易专辑ID
        })
      }
      albumMap.get(key).songs.push(s)
    }
    const playlistAlbums = Array.from(albumMap.values())

    // 2. 从收藏中提取唯一专辑
    const favAlbums = []
    const seen = new Set()
    for (const f of favorites) {
      const key = f.album || f.name
      if (!seen.has(key)) {
        seen.add(key)
        // 在 playlist 中找同专辑歌曲，获取 picId/albumId
        const relatedSongs = playlist.filter(s => (s.album || s.name) === key)
        const sample = relatedSongs[0] || f
        favAlbums.push({
          id: 'fav_' + (f.id || key),
          name: f.album || f.name,
          artist: f.artist,
          cover: f.cover || '/static/default-cover.png',
          source: 'fav',
          songs: relatedSongs.length > 0 ? relatedSongs : [{
            id: f.id, name: f.name, artist: f.artist, cover: f.cover, album: f.album || f.name, url: ''
          }],
          picId: sample.picId || '',
          albumId: sample.albumId || '',
        })
      }
    }

    // 合并：收藏专辑优先，再加热门专辑（去重）
    const favKeys = new Set(favAlbums.map(a => a.name))
    const combined = [
      ...favAlbums,
      ...playlistAlbums.filter(a => !favKeys.has(a.name)),
    ]
    this.setData({ coverFlowData: combined })
  },

  /* ============ 热门歌单 ============ */
  _loadPlaylist() {
    this.setData({ playlistLoaded: false })
    wx.request({
      url: 'https://ty-music.onrender.com/api/hot',
      method: 'GET',
      timeout: 20000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.songs) {
          const songs = res.data.songs.map(s => this._norm(s))
          this.setData({
            playlist: songs,
            playlistLoaded: true,
          })
          this._updateCoverFlow()
        }
      },
      fail: () => {
        if (!this.data._networkErrorShown) {
          this.data._networkErrorShown = true
          wx.showToast({ title: '后端连接中...', icon: 'none', duration: 2000 })
        }
      },
      complete: () => {
        if (!this.data.playlistLoaded)
          setTimeout(() => { this.data._networkErrorShown = false }, 5000)
      }
    })
  },

  onRetryPlaylist() {
    wx.showToast({ title: '重新连接...', icon: 'loading', duration: 1000 })
    this._loadPlaylist()
  },

  _norm(s) {
    return {
      id:       s.id || s.songId || '',
      name:     s.name || s.title || '未知歌曲',
      artist:   s.artist || (s.ar?.[0]?.name) || '未知艺人',
      cover:    s.cover
                  ? (/^https?:\/\//.test(s.cover) ? s.cover : 'https://ty-music.onrender.com' + s.cover)
                  : (s.al?.picUrl || '/static/default-cover.png'),
      album:    s.album || (s.al?.name) || '',
      albumId:  String(s.al?.id || s.albumId || ''),   // 网易专辑ID
      picId:    String(s.pic_id || s.picId || ''),      // 封面图片ID（同一专辑相同）
      url:      s.url || s.mp3url || '',
    }
  },

  /* ============ 导航 ============ */
  onBack() {
    const stack = [...this.data.viewStack]
    if (stack.length <= 1) return
    stack.pop()
    this.setData({
      viewStack: stack,
      currentView: stack[stack.length - 1],
      viewTitle: VIEW_TITLES[stack[stack.length - 1]] ?? '',
      menuIndex: 0, subMenuIndex: 0, settingsIndex: 0,
      searchKeyword: '', searchResults: [],
    })
  },

  _pushView(view) {
    this.setData({
      viewStack:   [...this.data.viewStack, view],
      currentView: view,
      viewTitle:   VIEW_TITLES[view] ?? '',
      menuIndex: 0, subMenuIndex: 0, settingsIndex: 0,
      wheelScrollTarget: '',
    })
  },

  onMenuTap(e) {
    const idx = +e.currentTarget.dataset.idx
    this.setData({ menuIndex: idx })
    this._pushView(['onlinemusic','coverflow','nowplaying','localmusic','settings'][idx])
  },

  onSubMenuTap(e) {
    const idx = +e.currentTarget.dataset.idx
    this.setData({ subMenuIndex: idx })
    this._pushView(idx === 0 ? 'search' : 'hot')
  },

  /* ============ 本地音乐 ============ */
  _loadLocalSongs() {
    try {
      const songs = wx.getStorageSync('typod_local') || []
      this.setData({ localSongs: songs })
    } catch (_) {}
  },

  onImportSong() {
    const that = this
    wx.chooseMessageFile({
      count: 10,
      type: 'file',
      success(res) {
        const fs = wx.getFileSystemManager()
        let imported = 0
        const newSongs = []

        ;(function next(i) {
          if (i >= res.tempFiles.length) {
            const all = [...that.data.localSongs, ...newSongs]
            that.setData({ localSongs: all })
            wx.setStorageSync('typod_local', all)
            wx.showToast({ title: `已导入 ${imported} 首`, icon: 'success' })
            return
          }
          const f = res.tempFiles[i]
          let name = (f.name || f.path || '').replace(/\.(mp3|wav|aac|m4a|flac|ogg)$/i, '')
          if (!name) name = '未知歌曲'
          const savePath = `${wx.env.USER_DATA_PATH}/local_${Date.now()}_${i}_${f.name || 'song'}`
          fs.saveFile({
            tempFilePath: f.path, filePath: savePath,
            success() {
              newSongs.push({ name, artist: '本地导入', path: savePath, id: `local_${Date.now()}_${i}` })
              imported++
              next(i + 1)
            },
            fail() { next(i + 1) }
          })
        })(0)
      },
    })
  },

  onPlayLocal(e) {
    const song = this.data.localSongs[+e.currentTarget.dataset.idx]
    if (song) this._playLocal(song)
  },

  _playLocal(song) {
    const base = { ...song }
    this.setData({
      playSong: base, currentSong: song,
      currentTime: 0, duration: 0, playing: false,
      currentTimeFmt: '00:00', durationFmt: '00:00',
      lyrics: [], currentLyricText: '', lyricActiveIdx: 0,
      loadingSong: false,
      viewStack: [...this.data.viewStack, 'nowplaying'],
      currentView: 'nowplaying', viewTitle: 'Now Playing',
    })
    app.globalData.player.currentSong = song
    app.globalData.player.playing = false
    this._createAudio(song.path, false)
  },

  onDeleteLocal(e) {
    const idx = +e.currentTarget.dataset.idx
    const song = this.data.localSongs[idx]
    if (!song) return
    wx.showModal({
      title: '删除歌曲',
      content: `确定删除「${song.name}」？`,
      success: (res) => {
        if (!res.confirm) return
        try { wx.getFileSystemManager().unlinkSync(song.path) } catch (_) {}
        const l = [...this.data.localSongs]; l.splice(idx, 1)
        this.setData({ localSongs: l })
        wx.setStorageSync('typod_local', l)
      }
    })
  },

  /* ============ 搜索 ============ */
  onSearchInput(e) { this.setData({ searchKeyword: e.detail.value }) },

  onSearch() {
    const kw = this.data.searchKeyword.trim()
    if (!kw) return wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
    wx.showLoading({ title: '搜索中...' })
    wx.request({
      url: 'https://ty-music.onrender.com/api/search',
      data: { keywords: kw, limit: 20 },
      timeout: 30000,
      success: (res) => {
        wx.hideLoading()
        if (res.statusCode === 200 && res.data?.songs) {
          const songs = res.data.songs.map(s => this._norm(s))
          this.setData({ searchResults: songs })
          if (!songs.length) wx.showToast({ title: '未找到结果', icon: 'none' })
        } else {
          wx.showToast({ title: '服务器异常: ' + (res.statusCode || '未知'), icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        wx.showToast({ title: '网络错误，请检查域名配置或重试', icon: 'none', duration: 2500 })
      },
      complete: () => wx.hideLoading()
    })
  },

  /* ============ 播放 ============ */
  onPlaySearchSong(e) { this._play(this.data.searchResults[+e.currentTarget.dataset.idx]) },
  onPlayFromList(e)   { this._play(this.data.playlist[+e.currentTarget.dataset.idx]) },

  _play(song) {
    if (!song) return
    const base = { ...song }
    this.setData({
      playSong: base, currentSong: song,
      currentTime: 0, duration: 0, playing: false,
      currentTimeFmt: '00:00', durationFmt: '00:00',
      currentLyricText: '', loadingSong: true,
      viewStack: [...this.data.viewStack, 'nowplaying'],
      currentView: 'nowplaying', viewTitle: 'Now Playing',
    })
    app.globalData.player.currentSong = song
    app.globalData.player.playing = false

    const BASE = 'https://ty-music.onrender.com'

    // 并行请求播放地址 + 歌词
    let urlDone = false, lyricDone = false
    const tryPlay = () => { if (urlDone && lyricDone) this.setData({ loadingSong: false }) }

    wx.request({
      url: BASE + '/api/play',
      data: { id: song.id }, timeout: 20000,
      success: (res) => {
        urlDone = true
        if (res.statusCode === 200 && res.data?.url) {
          const rawUrl = res.data.url
          let fullUrl = rawUrl.startsWith('http') ? rawUrl : (BASE + rawUrl)
          // 小程序需要服务器流式代理（而非 302 重定向），绕过域名白名单限制
          fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'stream=1'
          this.setData({ playSong: { ...base, url: fullUrl } })
          this._createAudio(fullUrl, true)
        } else {
          this._createAudio(song.url || '', false)
        }
        tryPlay()
      },
      fail: () => {
        urlDone = true
        this._createAudio(song.url || '', false)
        tryPlay()
      }
    })

    wx.request({
      url: BASE + '/api/lyric',
      data: { id: song.id }, timeout: 10000,
      success: (res) => {
        lyricDone = true
        if (res.statusCode === 200) {
          const raw = res.data?.lrc || res.data?.lyric
          if (raw) this._parseLyric(raw)
        }
        tryPlay()
      },
      fail: () => { lyricDone = true; tryPlay() }
    })
  },

  _playFromList(idx) { if (this.data.playlist[idx]) this._play(this.data.playlist[idx]) },

  /* ——— 歌词 ——— */
  _loadLyric(id) {
    if (!id) return
    wx.request({
      url: 'https://ty-music.onrender.com/api/lyric',
      data: { id }, timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200) {
          const raw = res.data?.lrc || res.data?.lyric
          if (raw) this._parseLyric(raw)
        }
      }
    })
  },

  _parseLyric(raw) {
    if (!raw) return
    const lyrics = []
    for (const l of raw.split('\n')) {
      const m = l.match(/\[(\d{2}):(\d{2})(?:\.(\d+))?\](.*)/)
      if (!m) continue
      const t = (+m[1]) * 60 + (+m[2]) + (+m[3] || 0) / 1000
      const txt = m[4].trim()
      if (txt) lyrics.push({ time: t, text: txt })
    }
    this.setData({ lyrics, lyricActiveIdx: 0, currentLyricText: lyrics[0]?.text || '' })
  },

  _updateLyric(t) {
    const { lyrics } = this.data
    if (!lyrics.length) return
    let idx = 0
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= t) { idx = i; break }
    }
    if (idx !== this.data.lyricActiveIdx) {
      this.setData({ lyricActiveIdx: idx, currentLyricText: lyrics[idx]?.text || '' })
    }
  },

  /* ——— 音频 ——— */
  _createAudio(src, autoplay) {
    if (this._audio) { this._audio.destroy(); this._audio = null }
    if (!src) {
      this.setData({ loadingSong: false })
      return wx.showToast({ title: '暂无可用音源', icon: 'none' })
    }
    const a = wx.createInnerAudioContext()
    a.obeyMuteSwitch = false
    a.onCanplay(() => {
      const d = a.duration || 0
      this.setData({ duration: d, durationFmt: this._fmtSec(d) })
      if (autoplay) a.play()
    })
    a.onPlay(() => { this.setData({ playing: true }); app.globalData.player.playing = true })
    a.onPause(() => { this.setData({ playing: false }); app.globalData.player.playing = false })
    a.onTimeUpdate(() => {
      const ct = a.currentTime
      this.setData({ currentTime: ct, currentTimeFmt: this._fmtSec(ct) })
      app.globalData.player.currentTime = ct
      this._updateLyric(ct)
    })
    a.onEnded(() => { this.setData({ playing: false }); this._handleSongEnd() })
    a.onError((err) => {
      console.error('audio error:', err)
      this.setData({ playing: false, loadingSong: false })
      const code = err?.errCode || 0
      const msg = err?.errMsg || ''
      let tip = '播放出错'
      if (code === 10001) tip = '系统音频被占用，请重试'
      else if (code === 10002) tip = '网络异常，请检查网络'
      else if (code === 10003) tip = '音频文件无效'
      else if (code === 10004) tip = '音频格式不支持'
      else if (msg.includes('domain') || msg.includes('url')) tip = '域名未配置，请在后台添加合法域名'
      wx.showToast({ title: tip, icon: 'none', duration: 2500 })
    })
    a.src = src
    this._audio = a
  },

  _handleSongEnd() {
    const { playMode, playlist, currentSong } = this.data
    const ci = playlist.findIndex(s => s.id === currentSong?.id)
    if (playMode === 2 && this._audio) { this._audio.seek(0); this._audio.play() }
    else if (playMode === 1) this._playFromList(~~(Math.random() * playlist.length))
    else if (ci >= 0 && ci < playlist.length - 1) this._playFromList(ci + 1)
  },

  onTogglePlay() {
    if (!this._audio) {
      if (this.data.playSong?.url) { this.setData({ loadingSong: true }); this._createAudio(this.data.playSong.url, true) }
      return
    }
    this.data.playing ? this._audio.pause() : this._audio.play()
  },

  onShuffle() {
    const next = this.data.playMode === 1 ? 0 : 1
    const labels = ['顺序','随机','单曲循环']
    this.setData({ playMode: next, playModeLabel: labels[next] })
    this._saveState()
    wx.showToast({ title: labels[next], icon: 'none', duration: 800 })
  },

  onPrev() {
    if (!this._audio) return
    const { playlist, currentSong } = this.data
    const ci = playlist.findIndex(s => s.id === currentSong?.id)
    if (ci > 0) this._playFromList(ci - 1)
    else if (this._audio.currentTime > 3) this._audio.seek(0)
  },

  onNext() {
    if (!this._audio) return
    const { playlist, currentSong } = this.data
    const ci = playlist.findIndex(s => s.id === currentSong?.id)
    if (ci >= 0 && ci < playlist.length - 1) this._playFromList(ci + 1)
    else if (ci === playlist.length - 1) this._playFromList(0)
  },

  onVolume() { wx.showToast({ title: '请用系统音量键调节', icon: 'none', duration: 1200 }) },

  /* ============ CoverFlow ============ */
  onCFTouchStart(e) { this._cfStart = e.touches[0].clientX; this._cfAccum = 0 },
  onCFTouchMove(e) {
    const dx = e.touches[0].clientX - this._cfStart
    this._cfAccum = dx
    if (Math.abs(this._cfAccum) < 50 || !this.data.coverFlowData.length) return
    const dir = this._cfAccum > 0 ? -1 : 1
    const n = Math.max(0, Math.min(this.data.coverFlowData.length - 1, this.data.cfActiveIdx + dir))
    if (n !== this.data.cfActiveIdx) {
      this.setData({ cfActiveIdx: n })
      wx.vibrateShort({ type: 'light' }).catch(() => {})
    }
    this._cfStart = e.touches[0].clientX; this._cfAccum = 0
  },
  onCFTouchEnd() { this._cfStart = null; this._cfAccum = 0 },
  onCFTap(e) {
    const idx = +e.currentTarget.dataset.idx
    if (idx === this.data.cfActiveIdx) {
      // 再次点击已选中专辑 → 进入歌曲列表
      this._openAlbum(this.data.coverFlowData[idx])
    } else {
      this.setData({ cfActiveIdx: idx })
      wx.vibrateShort({ type: 'light' }).catch(() => {})
    }
  },

  _openAlbum(album) {
    if (!album) return
    const BASE = 'https://ty-music.onrender.com'
    const that = this

    // 先显示已有歌曲（加载提示）
    this.setData({
      albumSongs: album.songs || [],
      albumName: album.name,
      albumCover: album.cover || '/static/default-cover.png',
      menuIndex: 0,
    })
    this._pushView('albumsongs')
    wx.vibrateShort({ type: 'medium' }).catch(() => {})

    // 优先用 albumId 调 /api/album?id=xxx（网易官方接口，返回整张专辑）
    const albumId = album.albumId || ''
    const picId   = album.picId || ''

    let url
    if (albumId) {
      url = BASE + '/api/album?id=' + encodeURIComponent(albumId)
    } else if (picId) {
      // 没有 albumId，用 picId 调 /api/music/album（搜索+过滤，可能不完整但比只有热门歌好）
      url = BASE + '/api/music/album?picId=' + encodeURIComponent(picId) + '&limit=100'
    } else {
      // 都没有，用专辑名搜索
      url = BASE + '/api/album/search?name=' + encodeURIComponent(album.name) +
            '&artist=' + encodeURIComponent(album.artist || '') + '&limit=100'
    }

    console.log('[Album] Fetching:', url)
    wx.showLoading({ title: '加载专辑全部歌曲...' })

    wx.request({
      url: url,
      timeout: 20000,
      success(res) {
        wx.hideLoading()
        if (res.statusCode === 200 && res.data?.songs?.length > 0) {
          const songs = res.data.songs.map(s => that._norm(s))
          that.setData({
            albumSongs: songs,
            albumName: album.name,
            albumCover: album.cover || '/static/default-cover.png',
          })
          console.log('[Album] Loaded', songs.length, 'songs for', album.name)
          wx.showToast({ title: '已加载 ' + songs.length + ' 首', icon: 'none', duration: 1000 })
        } else {
          console.log('[Album] Empty response, status:', res.statusCode, 'data:', res.data)
          wx.hideLoading()
          // 后端没返回数据，保持原有歌曲列表
          const localSongs = album.songs || []
          if (localSongs.length > 0) {
            wx.showToast({ title: '仅显示 ' + localSongs.length + ' 首（热门）', icon: 'none', duration: 1500 })
          }
        }
      },
      fail(err) {
        wx.hideLoading()
        console.log('[Album] Fetch failed:', err.message || err)
        // 保持原有歌曲列表
        const localSongs = album.songs || []
        if (localSongs.length > 0) {
          wx.showToast({ title: '网络错误，显示 ' + localSongs.length + ' 首', icon: 'none', duration: 1500 })
        }
      }
    })
  },

  onAlbumSongTap(e) {
    const idx = +e.currentTarget.dataset.idx
    const song = this.data.albumSongs[idx]
    if (song) this._play(song)
  },

  /* ============ 滚轮 ============ */
  onWheelTouchStart(e) {
    this._wStart = e.touches[0]; this._wAccum = 0; this._wLastStep = 0
  },

  _scrollTarget(view, idx) {
    const m = { menu: 'mi', onlinemusic: 'omi', search: 'si', hot: 'hi', localmusic: 'li', settings: 'seti', albumsongs: 'asi' }
    const p = m[view]; return p ? (p + '-' + idx) : ''
  },

  onWheelTouchMove(e) {
    if (!this._wStart) return
    const t = e.touches[0]
    /* 使用动态获取的轮盘中心，而非硬编码值 */
    const c = this._wheelCenter || { x: 0, y: 0 }
    const a1 = Math.atan2(this._wStart.clientY - c.y, this._wStart.clientX - c.x) * (180 / Math.PI)
    const a2 = Math.atan2(t.clientY - c.y, t.clientX - c.x) * (180 / Math.PI)
    let d = a2 - a1
    if (d > 180) d -= 360; if (d < -180) d += 360
    this._wAccum += d; this._wStart = t

    const steps = Math.round(this._wAccum / 25)
    if (steps === 0 || steps === this._wLastStep) return
    this._wLastStep = steps
    wx.vibrateShort({ type: 'light' }).catch(() => {})

    const { currentView, menuIndex, subMenuIndex, settingsIndex, playlist, searchResults, localSongs } = this.data
    if (currentView === 'menu') {
      const n = ((menuIndex + steps) % 5 + 5) % 5
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('menu', n) })
    } else if (currentView === 'onlinemusic') {
      const n = ((subMenuIndex + steps) % 2 + 2) % 2
      this.setData({ subMenuIndex: n, wheelScrollTarget: this._scrollTarget('onlinemusic', n) })
    } else if (currentView === 'settings') {
      const n = ((settingsIndex + steps) % 3 + 3) % 3
      this.setData({ settingsIndex: n, wheelScrollTarget: this._scrollTarget('settings', n) })
    } else if (currentView === 'search' && searchResults.length > 0) {
      const n = ((menuIndex + steps) % searchResults.length + searchResults.length) % searchResults.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('search', n) })
    } else if (currentView === 'hot' && playlist.length > 0) {
      const n = ((menuIndex + steps) % playlist.length + playlist.length) % playlist.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('hot', n) })
    } else if (currentView === 'localmusic' && localSongs.length > 0) {
      const n = ((menuIndex + steps) % localSongs.length + localSongs.length) % localSongs.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('localmusic', n) })
    } else if (currentView === 'nowplaying' && this._audio && this.data.duration > 0)
      this._audio.seek(Math.max(0, Math.min(this.data.duration, (this._audio.currentTime || 0) + steps * 2)))
    else if (currentView === 'coverflow')
      this.setData({ cfActiveIdx: Math.max(0, Math.min(this.data.coverFlowData.length - 1, this.data.cfActiveIdx + steps)) })
    else if (currentView === 'albumsongs' && this.data.albumSongs.length > 0) {
      const n = ((menuIndex + steps) % this.data.albumSongs.length + this.data.albumSongs.length) % this.data.albumSongs.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('albumsongs', n) })
    }
  },

  onWheelTouchEnd() { this._wStart = null; this._wAccum = 0; this._wLastStep = 0 },

  /* MENU 键 — 返回上一级；主菜单时跳到正在播放（有歌）或振动反馈 */
  onWheelMenuTap() {
    if (this.data.viewStack.length <= 1) {
      if (this.data.currentSong?.name) {
        this._pushView('nowplaying')
      } else {
        wx.vibrateShort({ type: 'heavy' }).catch(() => {})
      }
      return
    }
    this.onBack()
  },
  onWheelPrevTap() { this.onPrev() },
  onWheelNextTap() { this.onNext() },
  onWheelPlayTap() { this.onTogglePlay() },

  onWheelCenter() {
    const { currentView, menuIndex, subMenuIndex, cfActiveIdx, playlist, searchResults, localSongs } = this.data
    if (currentView === 'menu')
      this.onMenuTap({ currentTarget: { dataset: { idx: menuIndex } } })
    else if (currentView === 'onlinemusic')
      this.onSubMenuTap({ currentTarget: { dataset: { idx: subMenuIndex } } })
    else if (currentView === 'search' && searchResults[menuIndex])
      this._play(searchResults[menuIndex])
    else if (currentView === 'hot' && playlist[menuIndex])
      this._play(playlist[menuIndex])
    else if (currentView === 'localmusic' && localSongs[menuIndex])
      this._playLocal(localSongs[menuIndex])
    else if (currentView === 'nowplaying')
      this.onTogglePlay()
    else if (currentView === 'coverflow' && this.data.coverFlowData[cfActiveIdx]) {
      this._openAlbum(this.data.coverFlowData[cfActiveIdx])
    }
    else if (currentView === 'albumsongs' && this.data.albumSongs[menuIndex]) {
      this._play(this.data.albumSongs[menuIndex])
    }
  },

  /* ============ 设置 ============ */
  onPlayModeSwitch() {
    const labels = ['顺序','随机','单曲循环']
    const next = (this.data.playMode + 1) % 3
    this.setData({ playMode: next, playModeLabel: labels[next] })
    this._saveState()
    wx.showToast({ title: labels[next], icon: 'none', duration: 800 })
  },

  onToggleBacklight() { this.setData({ backlight: !this.data.backlight }); this._saveState() },

  onAbout() {
    wx.showModal({
      title: 'TY Pod',
      content: 'iPod Classic 风格音乐播放器\n\nMade by TY\n音源: TY Music',
      showCancel: false, confirmText: '好的',
    })
  },

  /* ============ 主题切换 ============ */
  onColorChange(e) {
    const c = e.currentTarget.dataset.color
    this.setData({ bodyColor: c, themeVars: app.getThemeCSSVars(c) })
    app.globalData.bodyColor = c
    app.saveTheme(c)
  },

  /* ============ 工具 ============ */
  _fmtSec(sec) {
    if (!sec || isNaN(sec)) return '00:00'
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  },

  onUnload() {
    if (this._audio) { this._audio.destroy(); this._audio = null }
    if (this._bgTimer) { clearInterval(this._bgTimer); this._bgTimer = null }
  },

  /* 凯斯哈林背景图轮播 — 每3分钟切换，用短轮询代替长setInterval */
  _startBgRotation() {
    this._bgLastChange = Date.now()
    this._bgInterval = 3 * 60 * 1000
    this._bgTimer = setInterval(() => {
      if (Date.now() - this._bgLastChange >= this._bgInterval) {
        const next = (this.data.bgIndex + 1) % this.data.bgImages.length
        this.setData({ bgIndex: next })
        this._bgLastChange = Date.now()
      }
    }, 5000)
  },
})
