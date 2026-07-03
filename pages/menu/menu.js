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
    searchLoading: false,
    searchHistory: [],        // 历史搜索词列表（最新在前，最多 10 条）
    hotArtists: [             // 热门歌手推荐
      { name: '周杰伦',  emoji: '🎹' },
      { name: '林俊杰',  emoji: '🎤' },
      { name: '陈奕迅',  emoji: '🎙️' },
      { name: '薛之谦',  emoji: '🎸' },
      { name: '邓紫棋',  emoji: '🎶' },
      { name: '毛不易',  emoji: '🎻' },
      { name: '张学友',  emoji: '🎼' },
      { name: '李荣浩',  emoji: '🎧' },
    ],

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
    lyricScrollTarget: 0,
    fullLyricScrollTop: 0,
    currentLyricText:  '',

    /* ——— 浮窗左右音波条高度（随 currentTime 节奏起伏） ——— */
    waveHeightsL: new Array(18).fill(8),
    waveHeightsR: new Array(18).fill(8),

    /* ——— 专辑主题色（从封面提取） ——— */
    themeColor:       'rgb(255,60,140)',
    themeColorBright: 'rgb(255,120,180)',
    themeColorSoft:   'rgb(150,80,255)',

    /* ——— 设置 ——— */
    playMode:      0,
    playModeLabel: '顺序',
    backlight:     false,
    bootPhase:     'idle',  // idle → inserting → inserted → plugged
    showWelcome:   true,    // 开机欢迎弹窗，关闭后才开始插入动画
    showFullLyric: false,   // 全屏歌词浮窗
    miniBarEntering: false, // Mini 播放条入场动画触发

    /* ——— CoverFlow ——— */
    cfActiveIdx: 0,
    cfFlippedIdx: -1,
    coverFlowData: [],
    inkAnimating: false,

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

    /* ——— 右侧滚动指示条 ——— */
    scrollBarTop: 0,
    scrollBarHeight: 100,
    scrollBarVisible: false,

    /* ——— 凯斯哈林背景轮播 ——— */
    bgIndex: 0,
    bgImages: [
      '/static/bg/bg1.jpg',
      '/static/bg/bg2.jpg',
      '/static/bg/bg3.jpg',
      '/static/bg/bg4.jpg',
      '/static/bg/bg5.jpg',
      '/static/bg/bg6.jpg',
    ],
  },

  onLoad() {
    this._initTheme()
    this._loadLocalSongs()
    this._loadFavorites()
    this._loadSearchHistory()

    // 搜索缓存（最多 20 条，避免重复请求唤醒 render.com）
    this._searchCache = new Map()
    this._searchCacheMax = 20
    // 搜索防抖定时器
    this._searchDebounce = null
    this._restoreState()
    this._queryWheelCenter()
    this._startBgRotation()
    // ⭐ 初始化后台音频管理器（支持后台/锁屏播放）
    this._initBgAudio()
    // 每次打开/刷新都重置屏幕为黑屏，播放 EarPods 开机动画
    this._bootAnimFirstShow = true
    this.setData({ backlight: false, bootPhase: 'idle' })
    // 预热完成后加载歌单
    this._warmupServer().then(() => {
      console.log('[Warmup] 预热完成，开始加载数据')
      this._loadPlaylist()
    })
    // 开机动画延迟到欢迎弹窗关闭后触发
    // this._startBootAnimation() — 移到 onCloseWelcome 中调用
  },

  /* ——— EarPods 开机动画 ———
     时序：等待 0.6s → 插头插入 1.5s → 手机马达震动 0.1s → 屏幕亮 0.7s → 完成
     注意：插入完成后只触发手机马达震动，机身不做视觉震动 */
  _startBootAnimation() {
    // 立即显示 EarPods（等待状态，在下方可见）
    this.setData({ bootPhase: 'waiting' })
    const phases = [
      // 0.6s 后开始插入
      { delay: 600,  action: () => { this.setData({ bootPhase: 'inserting' }) }},
      // 插入完成
      { delay: 2200, action: () => { this.setData({ bootPhase: 'inserted' }) }},
      // 仅手机马达震动，机身不视觉震动
      { delay: 2250, action: () => {
        wx.vibrateShort({ type: 'medium' }).catch(() => {})
      }},
      // 屏幕从暗 → 亮（延迟更久，让插入后有短暂黑屏停顿）
      { delay: 2600, action: () => { this.setData({ backlight: true }) }},
      // 完成：金属头消失，只有底座和线留在外壳边缘
      { delay: 3400, action: () => { this.setData({ bootPhase: 'plugged' }) }},
    ]
    phases.forEach(p => setTimeout(p.action, p.delay))
  },

  /* 关闭欢迎弹窗 → 开始播放插入动画 */
  onCloseWelcome() {
    this.setData({ showWelcome: false })
    this._startBootAnimation()
  },

  /* 点击专辑封面 → 打开全屏歌词浮窗 */
  onCoverTap() {
    if (!this.data.playSong) return
    // ★ 重置滚动位置 + 清空行位置缓存：每次开浮窗都重新测量，
    //   防止重复开关时拿到的仍是上次的过期缓存
    this._lyricRects = null
    this._lyricSvHeight = 0
    this.setData({ showFullLyric: true, fullLyricScrollTop: 0 })
    // 延迟等待浮窗渲染完成后测量行位置并滚动到当前行
    setTimeout(() => {
      this._measureLyricRects()
      setTimeout(() => this._scrollFullLyricCenter(this.data.lyricActiveIdx), 100)
    }, 300)
  },

  /* 关闭全屏歌词浮窗 */
  onCloseFullLyric() {
    this.setData({ showFullLyric: false })
    // ★ 关掉浮窗时清空缓存：下次打开时强制重新测量，避免使用过期行位置
    this._lyricRects = null
    this._lyricSvHeight = 0
  },

  /* 预热后端服务器（Render.com 免费版有冷启动，提前唤醒）
     返回 Promise，最多等 10s，超时不阻塞 */
  _warmupServer() {
    return new Promise((resolve) => {
      const done = (msg) => { console.log('[Warmup]', msg); resolve() }
      const timer = setTimeout(() => done('超时，直接加载'), 10000)
      wx.request({
        url: 'https://ty-music.onrender.com/api/health',
        timeout: 8000,
        success: () => { clearTimeout(timer); done('Server is awake') },
        fail: (err) => { clearTimeout(timer); done('Server still starting... ' + (err?.errMsg || '')) },
      })
    })
  },

  /* 动态获取轮盘中心坐标，用于准确计算圆周滑动角度 */
  _queryWheelCenter(cb) {
    wx.createSelectorQuery()
      .select('.ipod-wheel')
      .boundingClientRect((rect) => {
        if (rect) {
          this._wheelCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          }
        }
        if (cb) cb()
      })
      .exec()
  },

  onShow() {
    /* 首次 onShow 跳过（onLoad 已播放），后续每次回到前台都重播开机动画 */
    if (this._bootAnimFirstShow) {
      this._bootAnimFirstShow = false
    } else if (!this.data.showWelcome) {
      // 只有欢迎弹窗已关闭才重播（防止弹窗还在时重播）
      this.setData({ backlight: false, bootPhase: 'idle' })
      this._startBootAnimation()
    }
    const p = app.globalData.player
    if (p?.currentSong) {
      this.setData({
        currentSong: p.currentSong,
        playing: p.playing || false,
        currentTime: p.currentTime || 0,
        currentTimeFmt: this._fmtSec(p.currentTime || 0),
        playSong: p.currentSong,
      })
      // 恢复时也提取主题色
      if (p.currentSong.cover) this._extractThemeColor(p.currentSong.cover)
    }
    // ⭐ 同步后台音频管理器的实时状态（从后台切回前台时）
    if (this._audio && this.data.currentSong) {
      const ct = this._audio.currentTime || 0
      const d = this._audio.duration || 0
      const isPlaying = !this._audio.paused
      this.setData({
        playing: isPlaying,
        currentTime: ct,
        currentTimeFmt: this._fmtSec(ct),
        duration: d > 0 ? d : (this.data.duration || 0),
        durationFmt: d > 0 ? this._fmtSec(d) : (this.data.durationFmt || '00:00'),
      })
      app.globalData.player.playing = isPlaying
      app.globalData.player.currentTime = ct
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
      // 构造收藏对象，确保 albumId 不为空
      const fav = {
        id: song.id,
        name: song.name,
        artist: song.artist,
        cover: song.cover,
        album: song.album || song.name,
        albumId: song.albumId || song.picId || '',
        picId: song.picId || '',
      }
      favs.push(fav)
      wx.showToast({ title: '已收藏', icon: 'none', duration: 800 })
      wx.vibrateShort({ type: 'medium' }).catch(() => {})

      // 如果 albumId 为空，用专辑名查一次正确 albumId
      if (!fav.albumId && fav.album && fav.album !== fav.name) {
        this._fetchAlbumId(fav)
      }
    }
    this.setData({ favorites: favs })
    app.globalData.favorites = favs
    wx.setStorageSync('typod_favs', favs)
    const favIds = favs.map(f => f.id)
    this.setData({ favIds })
    this._updateCoverFlow()
  },

  // 用专辑名查 albumId（调用后端专辑搜索接口）
  _fetchAlbumId(fav) {
    const BASE = 'https://ty-music.onrender.com'
    const query = fav.artist ? `${fav.artist} ${fav.album}` : fav.album
    wx.request({
      url: BASE + '/api/album/search',
      data: { name: fav.album, artist: fav.artist || '' },
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.songs?.length > 0) {
          // 找到该专辑第一首歌的 picId 作为 albumId
          const song = res.data.songs[0]
          const newAlbumId = song.picId || song.albumId || ''
          if (newAlbumId) {
            // 更新 favorites 里的 albumId
            const favs = this.data.favorites.map(f => {
              if (f.id === fav.id) return { ...f, albumId: newAlbumId }
              return f
            })
            this.setData({ favorites: favs })
            app.globalData.favorites = favs
            wx.setStorageSync('typod_favs', favs)
            this._updateCoverFlow()
            console.log('[Favorite] Got albumId for', fav.album, ':', newAlbumId)
          }
        }
      },
      fail: () => {}
    })
  },

  /* ============ CoverFlow 数据 ============ */
  // 仅按【已收藏歌曲】的专辑分组 —— 不收藏就不显示
  _updateCoverFlow() {
    const { favorites } = this.data

    const albumMap = new Map()

    for (const s of (favorites || [])) {
      if (!s) continue
      const key = s.albumId || s.album || s.name || ('song_' + s.id)
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          id:       'album_' + key,
          name:     s.album || s.name,
          artist:   s.artist || '',
          cover:    s.cover || '/static/default-cover.png',
          albumId:  s.albumId || '',
          picId:    s.picId || s.albumId || '',
          songs:    [],
        })
      }
      const entry = albumMap.get(key)
      const exists = entry.songs.find(ex => ex.id === s.id)
      if (!exists) entry.songs.push(s)
    }

    const albums = Array.from(albumMap.values())
    this.setData({ coverFlowData: albums, cfActiveIdx: 0 })
  },

  /* ============ 热门歌单 ============ */
  _loadPlaylist() {
    this.setData({ playlistLoaded: false })

    // 热门歌手列表 — 并行搜索多组，合并去重 = 真正的"热门推荐"
    const artists = [
      '周杰伦', '林俊杰', '薛之谦', 'G.E.M.', 'Jay Chou',
      '五月天', '陈粒', '华晨宇', '张杰', '周深', '汪苏泷',
    ]
    let completed = 0
    const allSongs = []
    const seen = new Set()

    const tryFinish = () => {
      completed++
      if (completed < artists.length) return

      if (allSongs.length > 0) {
        // Fisher–Yates 洗牌，每次打开都有新鲜感
        for (let i = allSongs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]]
        }
        this.setData({
          playlist: allSongs,
          playlistLoaded: true,
        })
        this._updateCoverFlow()
      } else {
        // 全部失败 → 降级到 /api/hot（兜底）
        this._fallbackHot()
      }
    }

    const searchOne = (artist, attempt) => {
      attempt = attempt || 0
      wx.request({
        url: 'https://ty-music.onrender.com/api/music/search?keywords=' + encodeURIComponent(artist) + '&limit=30',
        method: 'GET',
        timeout: 15000,
        success: (res) => {
          if (res.statusCode === 200 && res.data?.songs) {
            const songs = res.data.songs.map(s => this._norm(s))
            for (const s of songs) {
              if (!seen.has(s.id)) {
                seen.add(s.id)
                allSongs.push(s)
              }
            }
            tryFinish()
          } else if (attempt < 1) {
            // 服务端异常 → 延时重试一次
            setTimeout(() => searchOne(artist, attempt + 1), 2000)
          } else {
            tryFinish()
          }
        },
        fail: () => {
          if (attempt < 1) {
            setTimeout(() => searchOne(artist, attempt + 1), 2000)
          } else {
            tryFinish()
          }
        },
      })
    }

    for (const a of artists) searchOne(a)
  },

  /* 降级兜底 — 搜索全部失败时用旧接口 */
  _fallbackHot() {
    wx.request({
      url: 'https://ty-music.onrender.com/api/hot',
      method: 'GET',
      timeout: 20000,
      success: (res) => {
        if (res.statusCode === 200 && res.data?.songs) {
          this.setData({
            playlist: res.data.songs.map(s => this._norm(s)),
            playlistLoaded: true,
          })
          this._updateCoverFlow()
        } else {
          this.setData({ playlistLoaded: true })
        }
      },
      fail: () => { this.setData({ playlistLoaded: true }) },
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
    // CoverFlow 退出 → 消散动画（无论是否正在进入动画都允许退出）
    if (stack[stack.length - 1] === 'coverflow') {
      this._endInkTransition()
      return
    }
    stack.pop()
    this._svH_menu = 0; this._svH_onlinemusic = 0; this._svH_search = 0
    this._svH_hot = 0; this._svH_localmusic = 0; this._svH_settings = 0; this._svH_albumsongs = 0
    clearTimeout(this._scrollBarTimer)
    const poppedView = stack[stack.length - 1]
    const clearSearch = poppedView !== 'search'
    this.setData({
      viewStack: stack,
      currentView: poppedView,
      viewTitle: VIEW_TITLES[poppedView] ?? '',
      menuIndex: 0, subMenuIndex: 0, settingsIndex: 0,
      // 从 Now Playing 返回到 search 时保留搜索结果；返回到其他页面则清空
      ...(clearSearch ? { searchKeyword: '', searchResults: [] } : {}),
      searchLoading: false,
      scrollBarVisible: false,
    })
    // 从 Now Playing 返回到非 Now Playing 页面时，触发屏幕内 mini 条入场动画
    if (this.data.playSong && this.data.currentView !== 'nowplaying') {
      this.setData({ miniBarEntering: false })
      setTimeout(() => { this.setData({ miniBarEntering: true }) }, 50)
    }
  },

  onOpenNowPlaying() {
    if (this.data.currentView === 'nowplaying') return
    if (!this.data.playSong) return
    // 隐藏 mini-bar 入场态，避免在过渡中闪烁
    this.setData({ miniBarEntering: false })
    this._pushView('nowplaying')
    this.setData({ viewTitle: 'Now Playing' })
  },

  _pushView(view) {
    this._svH_menu = 0; this._svH_onlinemusic = 0; this._svH_search = 0
    this._svH_hot = 0; this._svH_localmusic = 0; this._svH_settings = 0; this._svH_albumsongs = 0
    clearTimeout(this._scrollBarTimer)
    this.setData({
      viewStack:   [...this.data.viewStack, view],
      currentView: view,
      viewTitle:   VIEW_TITLES[view] ?? '',
      menuIndex: 0, subMenuIndex: 0, settingsIndex: 0,
      wheelScrollTarget: '',
      scrollBarVisible: false,
    })
  },

  // 强制隐藏过渡 Canvas，清理所有定时器与动画 ID
  _forceHideInkCanvas(cb) {
    if (this._enterHideTimer) { clearTimeout(this._enterHideTimer); this._enterHideTimer = null }
    if (this._exitHideTimer) { clearTimeout(this._exitHideTimer); this._exitHideTimer = null }
    this._inkAnimId = (this._inkAnimId || 0) + 1
    this.setData({
      inkAnimating: false,
    }, cb)
  },

  /* ================================================================
     霓虹水墨过渡动画
     - 进入 CoverFlow：霓虹墨滴从中心扩散，渐暗接入暗色背景
     - 退出 CoverFlow：画布消散，霓虹光点闪烁后淡出
     ================================================================ */

  // 霓虹调色板（比 CoverFlow 流动色块更浅更柔）
  // CoverFlow 实际配色（匹配 app.wxss neon-blob）
  _cfNeonPalette: [
    { r: 140, g: 70,  b: 230 },  // blob-1 紫色
    { r: 0,   g: 200, b: 235 },  // blob-2 青色
    { r: 230, g: 55,  b: 150 },  // blob-3 粉色
    { r: 80,  g: 180, b: 255 },  // blob-4 蓝色
    { r: 180, g: 30,  b: 80  },  // blob-5 暗红
    { r: 160, g: 115, b: 245 },  // 混合紫
    { r: 60,  g: 210, b: 240 },  // 混合青
    { r: 240, g: 80,  b: 170 },  // 混合粉
  ],

  _buildCfBlobs(W, H) {
    const blobDefs = [
      { px: 0.18, py: 0.55, prx: 0.70, pry: 0.80, c: { r: 130, g: 80,  b: 220 }, maxA: 0.22 },
      { px: 0.82, py: 0.50, prx: 0.60, pry: 0.75, c: { r: 0,   g: 200, b: 230 }, maxA: 0.16 },
      { px: 0.50, py: 0.85, prx: 0.55, pry: 0.50, c: { r: 220, g: 60,  b: 160 }, maxA: 0.13 },
      { px: -0.08,py: 0.10, prx: 0.32, pry: 0.42, c: { r: 140, g: 70,  b: 230 }, maxA: 0.35 },
      { px: 0.94, py: 0.45, prx: 0.28, pry: 0.37, c: { r: 0,   g: 200, b: 235 }, maxA: 0.30 },
      { px: 0.25, py: 0.95, prx: 0.30, pry: 0.40, c: { r: 230, g: 55,  b: 150 }, maxA: 0.28 },
      { px: 0.40, py: 0.30, prx: 0.20, pry: 0.26, c: { r: 80,  g: 180, b: 255 }, maxA: 0.24 },
      { px: 0.05, py: 0.60, prx: 0.26, pry: 0.34, c: { r: 180, g: 30,  b: 80  }, maxA: 0.32 },
      { px: 0.90, py: 0.15, prx: 0.24, pry: 0.32, c: { r: 20,  g: 100, b: 60  }, maxA: 0.30 },
      { px: 0.50, py: 0.85, prx: 0.55, pry: 0.50, c: { r: 220, g: 60,  b: 160 }, maxA: 0.22 },
    ]
    const blobs = []
    for (var i = 0; i < blobDefs.length; i++) {
      var d = blobDefs[i]
      blobs.push({
        x: W * d.px, y: H * d.py,
        rx: W * d.prx, ry: H * d.pry,
        c: d.c, maxAlpha: d.maxA,
      })
    }
    return blobs
  },

  _pickNeon() {
    return this._cfNeonPalette[Math.floor(Math.random() * this._cfNeonPalette.length)]
  },

  /* ——— 进入 CoverFlow：霓虹墨滴扩散 → 无缝融入 ——— */
  _startInkTransition() {
    const that = this
    if (that._enterHideTimer) { clearTimeout(that._enterHideTimer); that._enterHideTimer = null }
    if (that._exitHideTimer) { clearTimeout(that._exitHideTimer); that._exitHideTimer = null }
    that._inkAnimId = (that._inkAnimId || 0) + 1
    const animId = that._inkAnimId

    console.log('[Ink] Enter transition started, animId:', animId)

    // ★ 唯一定时器：1.5s 后 setData({inkAnimating:false}) → wx:if 移除 Canvas DOM
    var ENTER_DURATION = 1500
    that._enterHideTimer = setTimeout(function() {
      if (animId !== that._inkAnimId) {
        console.log('[Ink] Enter timer skipped — animId changed')
        return
      }
      console.log('[Ink] Enter timer fired — removing canvas (wx:if)')
      that.setData({ inkAnimating: false })
    }, ENTER_DURATION)

    // ★ 查询 Canvas（已由 onMenuTap 的 setData + wx:if 创建到 DOM 中）
    const query = wx.createSelectorQuery().in(that)
    query.select('#ink-canvas')
      .fields({ node: true, size: true })
      .exec(function(res) {
        if (animId !== that._inkAnimId) return
        if (!res || !res[0] || !res[0].node || res[0].width === 0 || res[0].height === 0) {
          console.log('[Ink] Canvas query failed — timer will remove canvas')
          return
        }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          const W = res[0].width
          const H = res[0].height
          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)

          const cx = W / 2
          const cy = H / 2
          // ═══ 颜色精确匹配 CoverFlow CSS ═══
          const paperColor  = { r: 244, g: 240, b: 253 }   // 主菜单底色
          const cfBgTop     = { r: 22,  g: 22,  b: 32  }   // #161620
          const cfBgBot     = { r: 13,  g: 13,  b: 20  }   // #0d0d14

          // CoverFlow 霓虹光晕（从模板计算 px 值）
          var cfBlobs = that._buildCfBlobs(W, H)

          // ═══ 色块炸开 → 融回系统 ═══
          // 每块先炸向屏幕边缘，再调头飞回 CoverFlow 光晕位置融入
          var blocks = []
          var neonColors = [
            { r: 140, g: 70,  b: 230 },  // 紫
            { r: 0,   g: 200, b: 235 },  // 青
            { r: 230, g: 55,  b: 150 },  // 粉
            { r: 80,  g: 180, b: 255 },  // 蓝
            { r: 255, g: 100, b: 80  },  // 橙
            { r: 180, g: 30,  b: 80  },  // 深红
            { r: 60,  g: 220, b: 140 },  // 绿
            { r: 220, g: 180, b: 40  },  // 金
            { r: 120, g: 80,  b: 255 },  // 蓝紫
            { r: 255, g: 60,  b: 130 },  // 玫红
          ]
          var numBlocks = 28
          for (var i = 0; i < numBlocks; i++) {
            var angle = (Math.PI * 2 / numBlocks) * i + (Math.random() - 0.5) * 0.4
            var burstDist = Math.max(W, H) * 0.72 + Math.random() * Math.max(W, H) * 0.25
            var burstX = cx + Math.cos(angle) * burstDist
            var burstY = cy + Math.sin(angle) * burstDist
            // 回归目标：对应方向的 CoverFlow 光晕位置
            var tgt = cfBlobs[i % cfBlobs.length]
            var mergeX = tgt.x + (Math.random() - 0.5) * 80
            var mergeY = tgt.y + (Math.random() - 0.5) * 60
            var color = neonColors[i % neonColors.length]
            var cr = Math.max(0, Math.min(255, color.r + Math.floor((Math.random() - 0.5) * 35)))
            var cg = Math.max(0, Math.min(255, color.g + Math.floor((Math.random() - 0.5) * 35)))
            var cb = Math.max(0, Math.min(255, color.b + Math.floor((Math.random() - 0.5) * 35)))
            blocks.push({
              origin: { x: cx + (Math.random() - 0.5) * 24, y: cy + (Math.random() - 0.5) * 18 },
              burst:  { x: burstX, y: burstY },
              merge:  { x: mergeX, y: mergeY },
              color:  { r: cr, g: cg, b: cb },
              size:   40 + Math.random() * 56,
              rot:    Math.random() * Math.PI * 2,
              rotSpd: (Math.random() - 0.5) * 4.0,
              delay:  Math.random() * 0.30,
              burstDur: 0.50 + Math.random() * 0.40,
              pause:    0.10 + Math.random() * 0.20,
              returnDur:0.80 + Math.random() * 0.70,
              maxAlpha: 0.85 + Math.random() * 0.15,
            })
          }

          // ═══ 三阶段 + 辉光弥散 ═══
          const TOTAL_TIME   = 1.5
          const MERGE_START  = 0.30
          const CF_REVEAL    = 0.75
          const BLOOM_START  = 1.1

          var startTime = null

          function drawRRect(cx2, cy2, w2, h2, r2) {
            ctx.moveTo(cx2 + r2, cy2)
            ctx.arcTo(cx2 + w2, cy2, cx2 + w2, cy2 + h2, r2)
            ctx.arcTo(cx2 + w2, cy2 + h2, cx2, cy2 + h2, r2)
            ctx.arcTo(cx2, cy2 + h2, cx2, cy2, r2)
            ctx.arcTo(cx2, cy2, cx2 + w2, cy2, r2)
            ctx.closePath()
          }

          function drawFrame(ts) {
            if (animId !== that._inkAnimId) return
            if (!startTime) startTime = ts
            var t = (ts - startTime) / 1000
            var progress = Math.min(1, t / TOTAL_TIME)

            // ═══ 1. 背景从纸色渐变为 CoverFlow 暗底 ═══
            ctx.clearRect(0, 0, W, H)
            var bgP = Math.pow(Math.min(1, t / 1.8), 0.5)
            var ss = 30
            for (var si = 0; si < ss; si++) {
              var py = H * (si / ss)
              var pos = si / ss
              var br = Math.round(paperColor.r + (cfBgTop.r - paperColor.r) * bgP + (cfBgBot.r - cfBgTop.r) * bgP * pos)
              var bg = Math.round(paperColor.g + (cfBgTop.g - paperColor.g) * bgP + (cfBgBot.g - cfBgTop.g) * bgP * pos)
              var bb = Math.round(paperColor.b + (cfBgTop.b - paperColor.b) * bgP + (cfBgBot.b - cfBgTop.b) * bgP * pos)
              ctx.fillStyle = 'rgb(' + br + ',' + bg + ',' + bb + ')'
              ctx.fillRect(0, py, W, H / ss + 1)
            }

            var bgIsDark = bgP > 0.22
            if (bgIsDark) ctx.globalCompositeOperation = 'lighter'

            // ═══ 2. 色块：炸开 → 暂停 → 融回 ═══
            for (var bi = 0; bi < blocks.length; bi++) {
              var blk = blocks[bi]
              var bt = Math.max(0, t - blk.delay)
              if (bt <= 0) continue

              var x, y, alpha, s, isReturning
              var burstP = Math.min(1, bt / blk.burstDur)
              var totalBurstEnd = blk.burstDur + blk.pause

              if (bt < totalBurstEnd) {
                // === 炸开阶段 ===
                var eased = 1 - Math.pow(1 - burstP, 3.0)
                x = blk.origin.x + (blk.burst.x - blk.origin.x) * eased
                y = blk.origin.y + (blk.burst.y - blk.origin.y) * eased
                s = blk.size * (0.35 + burstP * 0.65)
                alpha = blk.maxAlpha * Math.min(1, burstP * 2.5)
                isReturning = false
              } else {
                // === 回归融入阶段 ===
                var rt = bt - totalBurstEnd
                var retP = Math.min(1, rt / blk.returnDur)
                // ease-in-out：先加速再减速到目标
                var re = retP < 0.5 ? 2 * retP * retP : 1 - Math.pow(-2 * retP + 2, 2) / 2
                x = blk.burst.x + (blk.merge.x - blk.burst.x) * re
                y = blk.burst.y + (blk.merge.y - blk.burst.y) * re
                // 越靠近目标，色块越消融：缓慢缩小 + 透明度缓慢降低 + 软光晕扩散
                // 用更柔和的曲线：前 60% 变化平缓，后 40% 加速消散
                var dissolve = retP < 0.6 ? retP * 0.3 : 0.18 + (retP - 0.6) * 2.05
                dissolve = Math.min(1, dissolve)
                s = blk.size * (1 - dissolve * 0.75)
                alpha = blk.maxAlpha * (1 - dissolve * 0.85)
                isReturning = true
              }

              if (alpha < 0.005) continue
              blk.rot += blk.rotSpd * 0.016
              var c = blk.color

              ctx.save()
              ctx.translate(x, y)
              ctx.rotate(blk.rot)

              var halfS = s / 2
              var cornerR = s * 0.15

              if (isReturning) {
                // 回归阶段：色块边缘变软，外发光扩大，像融化进背景
                var meltScale = 1 + (1 - alpha / blk.maxAlpha) * 4.0
                // 大面积柔光晕 — 模拟色块融化，diffuse 扩散融入 CF 背景
                var meltGrad = ctx.createRadialGradient(0, 0, halfS * 0.2, 0, 0, halfS * meltScale * 3.0)
                meltGrad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.55).toFixed(4) + ')')
                meltGrad.addColorStop(0.4, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.25).toFixed(4) + ')')
                meltGrad.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)')
                ctx.fillStyle = meltGrad
                ctx.beginPath(); ctx.arc(0, 0, halfS * meltScale * 2.5, 0, Math.PI * 2); ctx.fill()
              }

              // 外发光
              var glowGrad = ctx.createRadialGradient(0, 0, halfS * 0.6, 0, 0, halfS * 1.8)
              glowGrad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.50).toFixed(4) + ')')
              glowGrad.addColorStop(0.5, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.18).toFixed(4) + ')')
              glowGrad.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)')
              ctx.fillStyle = glowGrad
              ctx.beginPath()
              drawRRect(-s * 0.9, -s * 0.9, s * 1.8, s * 1.8, cornerR * 1.5)
              ctx.fill()

              // 色块主体
              ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(4) + ')'
              ctx.beginPath()
              drawRRect(-halfS, -halfS, s, s, cornerR)
              ctx.fill()

              // 内部高光
              var innerGrad = ctx.createRadialGradient(-halfS * 0.25, -halfS * 0.25, 0, 0, 0, halfS * 1.2)
              innerGrad.addColorStop(0, 'rgba(255,255,255,' + (alpha * 0.32).toFixed(4) + ')')
              innerGrad.addColorStop(0.3, 'rgba(255,255,255,' + (alpha * 0.10).toFixed(4) + ')')
              innerGrad.addColorStop(1, 'rgba(255,255,255,0)')
              ctx.fillStyle = innerGrad
              ctx.beginPath()
              drawRRect(-halfS, -halfS, s, s, cornerR)
              ctx.fill()

              ctx.restore()
            }

            ctx.globalCompositeOperation = 'source-over'

            // ═══ 3. CoverFlow 霓虹光晕：从色块融回的位置浮现 ═══
            if (t > CF_REVEAL) {
              var blobP = Math.min(1, (t - CF_REVEAL) / (TOTAL_TIME - CF_REVEAL))
              var blobEase = blobP < 0.5 ? 2 * blobP * blobP : 1 - Math.pow(-2 * blobP + 2, 2) / 2

              for (var bbi = 0; bbi < cfBlobs.length; bbi++) {
                var b = cfBlobs[bbi]
                var ba = b.maxAlpha * blobEase
                if (ba < 0.0015) continue

                var bgrad = ctx.createRadialGradient(b.x, b.y, Math.max(b.rx, b.ry) * 0.06, b.x, b.y, Math.max(b.rx, b.ry) * 0.85)
                for (var bs = 0; bs <= 14; bs++) {
                  var bst = bs / 14
                  bgrad.addColorStop(bst, 'rgba(' + b.c.r + ',' + b.c.g + ',' + b.c.b + ',' + (ba * Math.pow(1 - bst, 4.0)).toFixed(4) + ')')
                }
                ctx.save()
                ctx.translate(b.x, b.y)
                ctx.scale(b.rx / Math.max(b.rx, b.ry), b.ry / Math.max(b.rx, b.ry))
                ctx.fillStyle = bgrad
                ctx.beginPath(); ctx.arc(0, 0, Math.max(b.rx, b.ry) * 0.85, 0, Math.PI * 2); ctx.fill()
                ctx.restore()
              }
            }

            // ═══ 4. 辉光弥散 — 纯视觉效果，不管理状态 ═══
            if (t > BLOOM_START) {
              var bloomP = Math.min(1, (t - BLOOM_START) / (TOTAL_TIME - BLOOM_START))
              var bloomCurve = Math.sin(bloomP * Math.PI)
              var bloomAlpha = bloomCurve * 1.05

              var bloomGrad = ctx.createRadialGradient(cx, cy * 0.55, Math.min(W, H) * 0.08, cx, cy, Math.max(W, H) * 0.7)
              for (var bsi = 0; bsi <= 14; bsi++) {
                var bst = bsi / 14
                var ba = bloomAlpha * Math.pow(1 - bst, 2.2)
                bloomGrad.addColorStop(bst, 'rgba(255,255,255,' + ba.toFixed(4) + ')')
              }
              ctx.fillStyle = bloomGrad
              ctx.fillRect(0, 0, W, H)
            }

            // 动画结束：停止 rAF 循环（隐藏 Canvas 由主线程 setTimeout 负责）
            if (t >= TOTAL_TIME) return
            canvas.requestAnimationFrame(drawFrame)
          }

          canvas.requestAnimationFrame(drawFrame)
        })
  },

  /* ——— 退出 CoverFlow：霓虹色块从光晕位置炸开消散 ——— */
  _endInkTransition() {
    const that = this
    // 清理可能残留的上一次动画状态
    if (that._enterHideTimer) { clearTimeout(that._enterHideTimer); that._enterHideTimer = null }
    if (that._exitHideTimer) { clearTimeout(that._exitHideTimer); that._exitHideTimer = null }
    that._inkAnimId = (that._inkAnimId || 0) + 1
    const animId = that._inkAnimId

    console.log('[Ink] Exit transition started, animId:', animId)

    // ★ 显示退出 Canvas（wx:if 创建 DOM）
    that.setData({ inkAnimating: true })

    // ★ 唯一定时器：2.0s 后移除 Canvas + pop view
    var EXIT_DURATION = 2000
    that._exitHideTimer = setTimeout(function() {
      if (animId !== that._inkAnimId) {
        console.log('[Ink] Exit timer skipped — animId changed')
        return
      }
      console.log('[Ink] Exit timer fired — removing canvas + popping view')
      var stack = [...that.data.viewStack]
      if (stack.length > 1) stack.pop()
      that.setData({
        viewStack: stack,
        currentView: stack[stack.length - 1],
        viewTitle: VIEW_TITLES[stack[stack.length - 1]] ?? '',
        menuIndex: 0, subMenuIndex: 0, settingsIndex: 0,
        searchKeyword: '', searchResults: [], searchLoading: false,
        inkAnimating: false,
      })
    }, EXIT_DURATION)

    // ★ 50ms 后查询 Canvas（等 wx:if 创建 DOM）
    setTimeout(function() {
      if (animId !== that._inkAnimId) return

      const query = wx.createSelectorQuery().in(that)
      query.select('#ink-canvas')
        .fields({ node: true, size: true })
        .exec(function(res) {
          if (animId !== that._inkAnimId) return
          if (!res || !res[0] || !res[0].node || res[0].width === 0 || res[0].height === 0) {
            console.log('[Ink] Exit canvas query failed — timer will remove canvas')
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          const W = res[0].width
          const H = res[0].height
          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)

          const cx = W / 2, cy = H / 2
          const paperColor = { r: 244, g: 240, b: 253 }
          const cfBgTop    = { r: 22,  g: 22,  b: 32 }
          const cfBgBot    = { r: 13,  g: 13,  b: 20 }
          const DURATION = 2.0

          const cfBlobs = that._buildCfBlobs(W, H)

          // 霓虹色块：从 CoverFlow 光晕位置 → 炸向屏幕边缘 → 消散
          var blocks = []
          var neonColors = [
            { r: 140, g: 70,  b: 230 }, { r: 0,   g: 200, b: 235 },
            { r: 230, g: 55,  b: 150 }, { r: 80,  g: 180, b: 255 },
            { r: 255, g: 100, b: 80  }, { r: 180, g: 30,  b: 80  },
            { r: 60,  g: 220, b: 140 }, { r: 220, g: 180, b: 40  },
            { r: 120, g: 80,  b: 255 }, { r: 255, g: 60,  b: 130 },
          ]
          var numBlocks = 32
          for (var i = 0; i < numBlocks; i++) {
            var tgt = cfBlobs[i % cfBlobs.length]
            var sx = tgt.x + (Math.random() - 0.5) * 100
            var sy = tgt.y + (Math.random() - 0.5) * 70
            var angle = (Math.PI * 2 / numBlocks) * i + (Math.random() - 0.5) * 0.5
            var burstDist = Math.max(W, H) * 0.85 + Math.random() * Math.max(W, H) * 0.3
            var ex = cx + Math.cos(angle) * burstDist
            var ey = cy + Math.sin(angle) * burstDist
            var color = neonColors[i % neonColors.length]
            var cr = Math.max(0, Math.min(255, color.r + Math.floor((Math.random() - 0.5) * 30)))
            var cg = Math.max(0, Math.min(255, color.g + Math.floor((Math.random() - 0.5) * 30)))
            var cb = Math.max(0, Math.min(255, color.b + Math.floor((Math.random() - 0.5) * 30)))
            blocks.push({
              sx: sx, sy: sy, ex: ex, ey: ey,
              color: { r: cr, g: cg, b: cb },
              size:   34 + Math.random() * 56,
              rot:    Math.random() * Math.PI * 2,
              rotSpd: (Math.random() - 0.5) * 4.5,
              delay:  Math.random() * 0.40,
              dur:    1.0 + Math.random() * 1.1,
              maxAlpha: 0.72 + Math.random() * 0.28,
            })
          }

          var startTime = null

          function drawRRect(cx2, cy2, w2, h2, r2) {
            ctx.moveTo(cx2 + r2, cy2)
            ctx.arcTo(cx2 + w2, cy2, cx2 + w2, cy2 + h2, r2)
            ctx.arcTo(cx2 + w2, cy2 + h2, cx2, cy2 + h2, r2)
            ctx.arcTo(cx2, cy2 + h2, cx2, cy2, r2)
            ctx.arcTo(cx2, cy2, cx2 + w2, cy2, r2)
            ctx.closePath()
          }

          function drawFrame(ts) {
            if (animId !== that._inkAnimId) return
            if (!startTime) startTime = ts
            var elapsed = (ts - startTime) / 1000
            var t = Math.min(1, elapsed / DURATION)

            // ═══ 1. 背景：CoverFlow 暗底 → 菜单纸色 ═══
            ctx.clearRect(0, 0, W, H)
            var bgP = Math.pow(t, 0.6)
            var ss = 25
            for (var si = 0; si < ss; si++) {
              var py = H * (si / ss), pos = si / ss
              var sR = cfBgTop.r + (cfBgBot.r - cfBgTop.r) * pos
              var sG = cfBgTop.g + (cfBgBot.g - cfBgTop.g) * pos
              var sB = cfBgTop.b + (cfBgBot.b - cfBgTop.b) * pos
              var br = Math.round(sR + (paperColor.r - sR) * bgP)
              var bg = Math.round(sG + (paperColor.g - sG) * bgP)
              var bb = Math.round(sB + (paperColor.b - sB) * bgP)
              ctx.fillStyle = 'rgb(' + br + ',' + bg + ',' + bb + ')'
              ctx.fillRect(0, py, W, H / ss + 1)
            }

            // ═══ 2. CoverFlow 霓虹光晕 → 渐暗消散 ═══
            var blobFade = 1 - Math.pow(t, 1.8)
            if (blobFade > 0.003) {
              ctx.globalCompositeOperation = 'lighter'
              for (var bbi = 0; bbi < cfBlobs.length; bbi++) {
                var b = cfBlobs[bbi]
                var ba = b.maxAlpha * blobFade
                if (ba < 0.002) continue
                var bgrad = ctx.createRadialGradient(b.x, b.y, Math.max(b.rx, b.ry) * 0.05, b.x, b.y, Math.max(b.rx, b.ry) * 0.78)
                for (var bs = 0; bs <= 8; bs++) {
                  var bst = bs / 8
                  bgrad.addColorStop(bst, 'rgba(' + b.c.r + ',' + b.c.g + ',' + b.c.b + ',' + (ba * Math.pow(1 - bst, 3.5)).toFixed(4) + ')')
                }
                ctx.save()
                ctx.translate(b.x, b.y)
                ctx.scale(b.rx / Math.max(b.rx, b.ry), b.ry / Math.max(b.rx, b.ry))
                ctx.fillStyle = bgrad
                ctx.beginPath(); ctx.arc(0, 0, Math.max(b.rx, b.ry) * 0.78, 0, Math.PI * 2); ctx.fill()
                ctx.restore()
              }
            }

            // ═══ 3. 霓虹色块：从光晕位置炸出 → 缩小 + 淡出 ═══
            for (var bi = 0; bi < blocks.length; bi++) {
              var blk = blocks[bi]
              var bt = Math.max(0, elapsed - blk.delay)
              if (bt <= 0) continue

              var moveP = Math.min(1, bt / blk.dur)
              var eased = Math.pow(moveP, 1.8)
              var x = blk.sx + (blk.ex - blk.sx) * eased
              var y = blk.sy + (blk.ey - blk.sy) * eased

              // alpha：前 25% 保持亮 → 后 75% 迅速衰减
              var alpha
              if (moveP < 0.25) {
                alpha = blk.maxAlpha * (0.85 + moveP / 0.25 * 0.15)
              } else {
                var decay = (moveP - 0.25) / 0.75
                alpha = blk.maxAlpha * (1 - Math.pow(decay, 1.4))
              }
              var s = blk.size * (1 - moveP * 0.55)

              if (alpha < 0.005) continue
              blk.rot += blk.rotSpd * 0.016
              var c = blk.color

              ctx.save()
              ctx.translate(x, y)
              ctx.rotate(blk.rot)

              var halfS = s / 2, cornerR = s * 0.14

              // 外发光
              var glowGrad = ctx.createRadialGradient(0, 0, halfS * 0.5, 0, 0, halfS * 2.0)
              glowGrad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.55).toFixed(4) + ')')
              glowGrad.addColorStop(0.4, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha * 0.20).toFixed(4) + ')')
              glowGrad.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)')
              ctx.fillStyle = glowGrad
              ctx.beginPath()
              drawRRect(-s * 0.95, -s * 0.95, s * 1.9, s * 1.9, cornerR * 1.6)
              ctx.fill()

              // 主体
              ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(4) + ')'
              ctx.beginPath()
              drawRRect(-halfS, -halfS, s, s, cornerR)
              ctx.fill()

              // 内高光
              var innerGrad = ctx.createRadialGradient(-halfS * 0.2, -halfS * 0.2, 0, 0, 0, halfS * 1.1)
              innerGrad.addColorStop(0, 'rgba(255,255,255,' + (alpha * 0.28).toFixed(4) + ')')
              innerGrad.addColorStop(0.35, 'rgba(255,255,255,' + (alpha * 0.08).toFixed(4) + ')')
              innerGrad.addColorStop(1, 'rgba(255,255,255,0)')
              ctx.fillStyle = innerGrad
              ctx.beginPath()
              drawRRect(-halfS, -halfS, s, s, cornerR)
              ctx.fill()

              ctx.restore()
            }

            ctx.globalCompositeOperation = 'source-over'

            // ═══ 4. 辉光弥散：白光一闪 → 收尾（纯视觉，不管理状态） ═══
            if (t > 0.72) {
              var bloomP = Math.min(1, (t - 0.72) / 0.28)
              var bloomA = Math.sin(bloomP * Math.PI) * 0.55
              if (bloomA > 0.005) {
                var bloomGrad = ctx.createRadialGradient(cx, cy * 0.5, Math.min(W, H) * 0.05, cx, cy, Math.max(W, H) * 0.65)
                for (var bsi = 0; bsi <= 10; bsi++) {
                  bloomGrad.addColorStop(bsi / 10, 'rgba(255,255,255,' + (bloomA * Math.pow(1 - bsi / 10, 2.0)).toFixed(4) + ')')
                }
                ctx.fillStyle = bloomGrad
                ctx.fillRect(0, 0, W, H)
              }
            }

            // 动画结束：停止 rAF 循环（隐藏 Canvas + pop view 由主线程 setTimeout 负责）
            if (t >= 1) return
            canvas.requestAnimationFrame(drawFrame)
          }

          canvas.requestAnimationFrame(drawFrame)
        })
    })
  },

  onMenuTap(e) {
    const idx = +e.currentTarget.dataset.idx
    // CoverFlow：setData 显示 Canvas（wx:if 创建 DOM），50ms 后查询并绘制
    if (idx === 1) {
      if (this.data.inkAnimating) return
      this.setData({
        viewStack: [...this.data.viewStack, 'coverflow'],
        currentView: 'coverflow',
        viewTitle: VIEW_TITLES['coverflow'] ?? '',
        menuIndex: idx,
        subMenuIndex: 0,
        settingsIndex: 0,
        wheelScrollTarget: '',
        inkAnimating: true,
      })
      var that = this
      setTimeout(function() { that._startInkTransition() }, 50)
      return
    }
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
      lyrics: [], currentLyricText: '', lyricActiveIdx: 0, lyricScrollTarget: 0, fullLyricScrollTop: 0,
      loadingSong: true,
      viewStack: [...this.data.viewStack, 'nowplaying'],
      currentView: 'nowplaying', viewTitle: 'Now Playing',
    })
    app.globalData.player.currentSong = song
    app.globalData.player.playing = false
    // 提取专辑封面主题色
    this._extractThemeColor(song.cover)
    /* ⭐ 本地文件直接 autoplay=true — 不需要再点一下 */
    this._createAudio(song.path)  },

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
  onSearchInput(e) {
    const v = e.detail.value
    this.setData({ searchKeyword: v })
    // 防抖：400ms 内不再触发新的搜索请求
    if (this._searchDebounce) clearTimeout(this._searchDebounce)
    if (v.trim().length > 0) {
      this._searchDebounce = setTimeout(() => this.onSearch(), 400)
    } else {
      // 输入清空时重置状态
      this.setData({ searchResults: [], searchLoading: false })
    }
  },

  onSearch() {
    const kw = this.data.searchKeyword.trim()
    if (!kw) return wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
    // 命中缓存直接返回，不走网络
    if (this._searchCache.has(kw)) {
      console.log('[Search] 命中缓存:', kw)
      this.setData({ searchResults: this._searchCache.get(kw), searchLoading: false })
      // 命中缓存也算"搜索过"，记录到历史
      this._addSearchHistory(kw)
      return
    }
    // 递增序列号，防止旧搜索结果覆盖新搜索
    this._searchSeq = (this._searchSeq || 0) + 1
    this.setData({ searchResults: [], searchLoading: true })
    this._doSearch(kw, 0, this._searchSeq)
  },

  /* ——— 搜索历史持久化 ——— */
  _loadSearchHistory() {
    try {
      const raw = wx.getStorageSync('typod_search_history')
      const list = Array.isArray(raw) ? raw.filter(s => typeof s === 'string' && s.trim()) : []
      this.setData({ searchHistory: list })
    } catch (e) {
      console.warn('[SearchHistory] 读取失败:', e)
    }
  },
  _saveSearchHistory(list) {
    try { wx.setStorageSync('typod_search_history', list) } catch (e) { console.warn('[SearchHistory] 写入失败:', e) }
  },
  // 搜索成功（拿到非空结果）后调用；去重、最新置顶、限 10 条
  _addSearchHistory(kw) {
    const trimmed = String(kw || '').trim()
    if (!trimmed) return
    const cur = this.data.searchHistory || []
    const filtered = cur.filter(s => s !== trimmed)
    filtered.unshift(trimmed)
    const next = filtered.slice(0, 10)
    this.setData({ searchHistory: next })
    this._saveSearchHistory(next)
  },
  // 删除单条历史
  _removeSearchHistory(e) {
    const idx = +e.currentTarget.dataset.idx
    const list = [...(this.data.searchHistory || [])]
    if (idx < 0 || idx >= list.length) return
    list.splice(idx, 1)
    this.setData({ searchHistory: list })
    this._saveSearchHistory(list)
  },
  // 清空全部历史
  _clearSearchHistory() {
    this.setData({ searchHistory: [] })
    this._saveSearchHistory([])
  },
  // 点击历史/热门项 → 直接搜索
  onSearchKeywordTap(e) {
    const kw = (e.currentTarget.dataset.kw || '').trim()
    if (!kw) return
    this.setData({ searchKeyword: kw, menuIndex: 0 })
    this.onSearch()
  },

  _doSearch(kw, retryCount, seq) {
    // 如果序列号不匹配，说明用户已经发起了新的搜索，放弃本次
    if (seq !== this._searchSeq) return
    // 最多重试 3 次，间隔递增 1.5s / 3s / 5s
    const delays = [0, 1500, 3000, 5000]
    const BASE = 'https://ty-music.onrender.com'
    const run = () => {
      // 再次检查序列号（延迟后可能已经过期）
      if (seq !== this._searchSeq) return
      console.log('[Search] 发起搜索:', kw, '(尝试次数:', retryCount + 1, ')')
      wx.request({
        url: BASE + '/api/music/search?keywords=' + encodeURIComponent(kw) + '&limit=50',
        method: 'GET',
        timeout: 12000,
        success: (res) => {
          // 旧搜索的回调，忽略
          if (seq !== this._searchSeq) return
          console.log('[Search] statusCode:', res.statusCode)
          let data = res.data
          if (typeof data === 'string') {
            try { data = JSON.parse(data) } catch(e) { data = {} }
          }
          // 兼容多种返回格式：data.songs / data.result.songs / data.data.songs
          let songs = []
          if (data?.songs && Array.isArray(data.songs)) {
            songs = data.songs
          } else if (data?.result?.songs && Array.isArray(data.result.songs)) {
            songs = data.result.songs
          } else if (data?.data?.songs && Array.isArray(data.data.songs)) {
            songs = data.data.songs
          }
          console.log('[Search] 解析到歌曲数:', songs.length)

          if (res.statusCode === 200 && songs.length > 0) {
            const normed = songs.map(s => this._norm(s))
            // 写缓存（LRU：超过 20 条时删最早的一条）
            if (this._searchCache.size >= (this._searchCacheMax || 20)) {
              const firstKey = this._searchCache.keys().next().value
              this._searchCache.delete(firstKey)
            }
            this._searchCache.set(kw, normed)
            this.setData({ searchResults: normed, searchLoading: false })
            // 记录到搜索历史
            this._addSearchHistory(kw)
          } else if (res.statusCode === 200 && songs.length === 0) {
            // 服务端返回空数组，且还有重试机会 → 重试
            if (retryCount < 3) {
              console.log('[Search] 返回空结果，将重试...')
              setTimeout(() => this._doSearch(kw, retryCount + 1, seq), delays[retryCount + 1])
              return
            }
            this.setData({ searchResults: [], searchLoading: false })
            wx.showToast({ title: '未找到「' + kw + '」', icon: 'none', duration: 2000 })
          } else {
            // 服务端异常 → 重试
            console.error('[Search] 异常响应:', JSON.stringify(data).substring(0, 500))
            if (retryCount < 3) {
              console.log('[Search] 服务端异常，将重试...')
              setTimeout(() => this._doSearch(kw, retryCount + 1, seq), delays[retryCount + 1])
              return
            }
            this.setData({ searchLoading: false })
            wx.showToast({ title: '服务异常，请重试', icon: 'none', duration: 2000 })
          }
        },
        fail: (err) => {
          // 旧搜索的回调，忽略
          if (seq !== this._searchSeq) return
          console.error('[Search] 请求失败:', JSON.stringify(err))
          if (retryCount < 3) {
            console.log('[Search] 网络失败，将重试...')
            setTimeout(() => this._doSearch(kw, retryCount + 1, seq), delays[retryCount + 1])
            return
          }
          this.setData({ searchLoading: false })
          let msg = '搜索失败，请重试'
          if (err.errMsg) {
            const em = err.errMsg
            if (em.indexOf('fail url not in domain list') >= 0) {
              msg = '域名未配置\n请在微信后台添加域名'
            } else if (em.indexOf('timeout') >= 0) {
              msg = '服务器响应超时，请重试'
            }
          }
          wx.showToast({ title: msg, icon: 'none', duration: 3000 })
        }
      })
    }
    if (delays[retryCount] > 0) {
      setTimeout(run, delays[retryCount])
    } else {
      run()
    }
  },

  /* ============ 播放 ============ */
  onPlaySearchSong(e) { this._play(this.data.searchResults[+e.currentTarget.dataset.idx]) },
  onPlayFromList(e)   { this._play(this.data.playlist[+e.currentTarget.dataset.idx]) },

  _play(song) {
    if (!song) return
    const base = { ...song }
    // ⭐ 立刻展示 Now Playing + loading（用户立刻看到界面切换，感知更快）
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
    this._currentPlayId = song.id

    // 提取专辑封面主题色
    this._extractThemeColor(song.cover)

    const BASE = 'https://ty-music.onrender.com'

    // 本地文件 → 直接播（秒播）
    if (song.path) {
      console.log('[Audio] 本地路径，秒播:', song.path)
      this._createAudio(song.path)
      this._loadLyric(song.id)
      return
    }

    // ⭐ 直接拼代理 URL，跳过 /api/play 调用，省 ~1s
    // 不加 &stream=1：proxy 返回 302 重定向到真实音频 URL，BackgroundAudioManager 自动跟随
    // （stream=1 会导致部分歌曲从上游 403）
    const proxyUrl = BASE + '/api/music/proxy?id=' + song.id
    console.log('[Audio] 直接开播（跳过 /api/play）:', proxyUrl.substring(0, 70))
    this.setData({ 'playSong.url': proxyUrl })
    this._createAudio(proxyUrl)

    // 并行拿歌词（不阻塞播放）
    this._loadLyric(song.id)
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
          const traw = res.data?.tlyric || ''
          if (raw) this._parseLyric(raw, traw)
        }
      }
    })
  },

  /* ——— 从专辑封面提取主题色 ——— */
  _extractThemeColor(coverUrl) {
    if (!coverUrl || coverUrl === '/static/default-cover.png') return
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: 60, height: 60 })
      const ctx = canvas.getContext('2d')
      const img = canvas.createImage()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 60, 60)
        const pixels = ctx.getImageData(0, 0, 60, 60).data

        // 按色块分桶，优先选高饱和度+中等亮度的颜色
        const buckets = {}
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const brightness = (r + g + b) / 3
          if (brightness < 35 || brightness > 225) continue      // 跳过过暗/过亮
          const sat = max === 0 ? 0 : (max - min) / max
          if (sat < 0.20) continue                                // 跳过低饱和
          // 量化到 32 级
          const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5)
          if (!buckets[key]) buckets[key] = { rSum: 0, gSum: 0, bSum: 0, count: 0, satSum: 0 }
          const bk = buckets[key]
          bk.rSum += r; bk.gSum += g; bk.bSum += b; bk.count++; bk.satSum += sat
        }

        let best = null, bestScore = 0
        for (const k in buckets) {
          const bk = buckets[k]
          const avgR = bk.rSum / bk.count, avgG = bk.gSum / bk.count, avgB = bk.bSum / bk.count
          const avgSat = bk.satSum / bk.count
          const avgBright = (avgR + avgG + avgB) / 3
          // 评分：频次 × 饱和度 × 偏好中等亮度
          const brightFactor = 1 - Math.abs(avgBright - 130) / 130
          const score = bk.count * avgSat * Math.max(0.3, brightFactor)
          if (score > bestScore) { bestScore = score; best = { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) } }
        }

        // 兜底：没有高饱和色 → 取全局最频繁色
        if (!best) {
          const all = {}
          for (let i = 0; i < pixels.length; i += 4) {
            const key = (pixels[i] >> 5) + ',' + (pixels[i+1] >> 5) + ',' + (pixels[i+2] >> 5)
            all[key] = (all[key] || 0) + 1
          }
          let maxC = 0
          for (const k in all) {
            if (all[k] > maxC) {
              maxC = all[k]
              const p = k.split(',')
              best = { r: (+p[0] << 5) + 16, g: (+p[1] << 5) + 16, b: (+p[2] << 5) + 16 }
            }
          }
        }
        if (!best) return

        const main = 'rgb(' + best.r + ',' + best.g + ',' + best.b + ')'
        // 亮色变体：向白色混合 35%
        const br = Math.min(255, Math.round(best.r + (255 - best.r) * 0.35))
        const bg = Math.min(255, Math.round(best.g + (255 - best.g) * 0.35))
        const bb = Math.min(255, Math.round(best.b + (255 - best.b) * 0.35))
        const bright = 'rgb(' + br + ',' + bg + ',' + bb + ')'
        // 柔色变体：向黑色混合 40%
        const sr = Math.round(best.r * 0.60)
        const sg = Math.round(best.g * 0.60)
        const sb = Math.round(best.b * 0.60)
        const soft = 'rgb(' + sr + ',' + sg + ',' + sb + ')'

        this.setData({ themeColor: main, themeColorBright: bright, themeColorSoft: soft })
        console.log('[ThemeColor] Extracted:', main, '→ bright:', bright, 'soft:', soft)
      }
      img.onerror = () => {}
      img.src = coverUrl
    } catch (e) {
      console.error('[ThemeColor] Extract failed:', e)
    }
  },

  _parseLyric(raw, traw) {
    if (!raw) return
    const lyrics = []
    // 解析翻译歌词为 { time: text } 映射
    const tMap = {}
    if (traw) {
      for (const l of traw.split('\n')) {
        const m = l.match(/\[(\d{2}):(\d{2})(?:\.(\d+))?\](.*)/)
        if (!m) continue
        const t = (+m[1]) * 60 + (+m[2]) + (+m[3] || 0) / 1000
        const txt = m[4].trim()
        if (txt) tMap[t] = txt
      }
    }
    // 解析原文歌词，匹配翻译
    for (const l of raw.split('\n')) {
      const m = l.match(/\[(\d{2}):(\d{2})(?:\.(\d+))?\](.*)/)
      if (!m) continue
      const t = (+m[1]) * 60 + (+m[2]) + (+m[3] || 0) / 1000
      const txt = m[4].trim()
      if (txt) {
        const tr = tMap[t] || ''
        lyrics.push({ time: t, text: txt, tr: tr })
      }
    }
    this.setData({ lyrics, lyricActiveIdx: 0, lyricScrollTarget: 0, currentLyricText: lyrics[0]?.text || '' })
    // 预测量所有歌词行位置，供丝滑滚动使用
    this._lyricRects = null
    setTimeout(() => this._measureLyricRects(), 200)
  },

  /* 预测量浮窗歌词每行的绝对位置 + scroll-view 高度，缓存后供同步滚动计算 */
  _measureLyricRects() {
    const { lyrics, showFullLyric } = this.data
    if (!lyrics.length || !showFullLyric) return
    const query = wx.createSelectorQuery().in(this)
    query.select('.full-lyric-scroll').boundingClientRect()
    query.select('.full-lyric-scroll').scrollOffset()
    lyrics.forEach((_, i) => {
      query.select('#fl-lyric-' + i).boundingClientRect()
    })
    query.exec((res) => {
      if (!res || !res[0]) return
      const svRect = res[0]
      const scrollOffset = res[1] || { scrollTop: 0 }
      this._lyricSvHeight = svRect.height
      this._lyricRects = []
      // res[0] = svRect, res[1] = scrollOffset, res[2..] = item rects
      for (let i = 0; i < lyrics.length; i++) {
        const itemRes = res[i + 2]
        if (itemRes) {
          // 转换为内容绝对位置：viewport-relative top - svRect.top + scrollTop
          this._lyricRects.push({
            top: itemRes.top - svRect.top + scrollOffset.scrollTop,
            height: itemRes.height
          })
        } else {
          // 占位 null，保持索引对齐
          this._lyricRects.push(null)
        }
      }
    })
  },

  _updateLyric(t) {
    const { lyrics } = this.data
    if (!lyrics.length) return
    let idx = 0
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= t) { idx = i; break }
    }
    if (idx !== this.data.lyricActiveIdx) {
      /* 使用缓存的行位置同步计算滚动位置，高亮和滚动一次性 setData */
      let scrollTop = this.data.fullLyricScrollTop
      if (this.data.showFullLyric && this._lyricRects && this._lyricRects[idx] && this._lyricSvHeight) {
        const rect = this._lyricRects[idx]
        scrollTop = Math.max(0, rect.top + rect.height / 2 - this._lyricSvHeight / 2)
      }
      this.setData({
        lyricActiveIdx: idx,
        lyricScrollTarget: idx,
        currentLyricText: lyrics[idx]?.text || '',
        fullLyricScrollTop: scrollTop
      })
      // ★ 缓存缺失：异步重新测量，下次切行就能精确滚动
      if (this.data.showFullLyric && (!this._lyricRects || !this._lyricRects[idx])) {
        this._measureLyricRects()
      }
    }
  },

  /**
   * 根据 currentTime 模拟节拍，生成左右两侧音波条的高度数组
   *
   * 算法：
   *   - 主拍 ≈ 120 BPM（每秒 2 拍，phase = t * 2π / 0.5）
   *   - 高频细节：sin(t * 11 + i * 0.6) 制造每根条的快速抖动
   *   - 中频起伏：sin(t * 4 + i * 0.4) 制造波峰波谷的"传递感"
   *   - 低频大波：sin(t * 1.3) 整组音量包络
   *   - 强拍强调：每 4 拍一次的 sin 脉冲（pow 3）让重拍"砸"出来
   *   - 左右镜像 + 微小独立抖动
   *
   * 节流：200ms 一次，onTimeUpdate 触发频率约 250-1000ms，足够顺滑且不卡
   */
  _tickWaveBars(t) {
    if (!this.data.showFullLyric) return
    const now = Date.now()
    if (this._lastWaveTick && now - this._lastWaveTick < 180) return
    this._lastWaveTick = now

    const N = 18
    const MIN_H = 6
    const MAX_H = 56
    const L = new Array(N)
    const R = new Array(N)

    // 1) 整组包络：低频大波（让波形有"呼吸感"）
    const env = 0.55 + 0.45 * Math.sin(t * 1.3)

    // 2) 强拍脉冲：每 4 拍（约 2 秒）一次，pow 3 让重拍"砸"得明显
    const beatPhase = (t * 2) % 4        // 0..4 循环
    const strongBeat = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI / 2)), 3)

    for (let i = 0; i < N; i++) {
      // 高频细节
      const hiL = Math.sin(t * 11.0 + i * 0.6) * 0.5
      // 中频起伏（让波峰从中心向两边"传"出去）
      const midL = Math.sin(t * 4.0 - i * 0.45) * 0.35
      // 位置衰减：离中心（i=0）越远略小
      const dist = i / N
      const fall = 1.0 - dist * 0.25

      // 合成：包络 × 强拍 × 位置衰减 + 高频细节
      let ampL = (env * (0.55 + 0.45 * strongBeat) * fall) + hiL * 0.30 + midL * 0.25
      // 钳制到 0..1
      ampL = Math.max(0, Math.min(1, ampL))

      // 右侧：与左侧对称但有微小相位差，模拟立体声
      const hiR = Math.sin(t * 11.0 + i * 0.6 + 0.7) * 0.5
      const midR = Math.sin(t * 4.0 - i * 0.45 + 0.4) * 0.35
      let ampR = (env * (0.55 + 0.45 * strongBeat) * fall) + hiR * 0.30 + midR * 0.25
      ampR = Math.max(0, Math.min(1, ampR))

      L[i] = Math.round(MIN_H + ampL * (MAX_H - MIN_H))
      R[i] = Math.round(MIN_H + ampR * (MAX_H - MIN_H))
    }

    this.setData({ waveHeightsL: L, waveHeightsR: R })
  },

  /* 全屏歌词浮窗：将当前行滚动到中间（仅在打开浮窗时调用一次） */
  _scrollFullLyricCenter(idx) {
    if (!this.data.showFullLyric) return
    // 先尝试用缓存
    if (this._lyricRects && this._lyricRects[idx] && this._lyricSvHeight) {
      const rect = this._lyricRects[idx]
      const target = Math.max(0, rect.top + rect.height / 2 - this._lyricSvHeight / 2)
      this.setData({ fullLyricScrollTop: target })
      return
    }
    // 缓存不存在则强制测量一次（不受 showFullLyric 守卫影响，因为这里调用时浮窗已开）
    this._measureLyricRects()
    setTimeout(() => {
      if (!this.data.showFullLyric) return
      if (this._lyricRects && this._lyricRects[idx] && this._lyricSvHeight) {
        const rect = this._lyricRects[idx]
        const target = Math.max(0, rect.top + rect.height / 2 - this._lyricSvHeight / 2)
        this.setData({ fullLyricScrollTop: target })
      }
    }, 150)
  },

  /* ———— 后台音频管理器 ——— */
  // 初始化 BackgroundAudioManager（单例），注册所有事件监听（仅调用一次）
  _initBgAudio() {
    if (this._audio) return  // 已初始化

    const bgAudio = wx.getBackgroundAudioManager()
    const that = this

    // ⭐ onTimeUpdate：播放进度更新 + 首次确认为播放中
    bgAudio.onTimeUpdate(() => {
      if (!that._audioConfirmed) {
        that._audioConfirmed = true
        console.log('[Audio] 播放已确认（onTimeUpdate）')
        that.setData({ playing: true, loadingSong: false })
        app.globalData.player.playing = true
        that._clearAudioTimers()
      }
      const ct = bgAudio.currentTime
      const d = bgAudio.duration || 0
      that.setData({
        currentTime: ct,
        currentTimeFmt: that._fmtSec(ct),
        duration: d > 0 ? d : (that.data.duration || 0),
        durationFmt: d > 0 ? that._fmtSec(d) : (that.data.durationFmt || '00:00'),
      })
      app.globalData.player.currentTime = ct
      that._updateLyric(ct)
      // ⭐ 节拍驱动的左右音波线条起伏
      that._tickWaveBars(ct)
    })

    // ⭐ onPlay：每次都同步 playing 状态（修复"暂停键反复点"bug——之前用 _audioConfirmed 闸门吞掉了后续恢复播放事件，导致 UI 状态卡死）
    bgAudio.onPlay(() => {
      if (!that._audioConfirmed) {
        that._audioConfirmed = true
        console.log('[Audio] 播放已确认（onPlay）')
        that._clearAudioTimers()
      }
      // 每次 onPlay 都必须同步状态，不能 return
      that.setData({ playing: true, loadingSong: false })
      app.globalData.player.playing = true
    })

    // ⭐ onError：远端 URL 失败 → stream=1 代理流 → 下载兜底
    bgAudio.onError((err) => {
      console.error('[Audio] onError:', JSON.stringify(err))
      if (that._audioConfirmed) return
      that._clearAudioTimers()
      const src = that._audioSrc
      if (!src) return
      if (src.startsWith('http') && !src.startsWith('wxfile://')) {
        if (!src.includes('stream=1') && !that._audioFallbackTried) {
          that._audioFallbackTried = true
          const streamUrl = src + '&stream=1'
          console.log('[Audio] onError → 尝试 stream=1 代理流')
          that._setBgAudioSrc(streamUrl)
        } else if (!that._audioDownloadTried) {
          that._audioDownloadTried = true
          console.log('[Audio] onError → 走本地下载兜底')
          that._downloadAsFallback(src)
        } else {
          that.setData({ playing: false, loadingSong: false })
          wx.showToast({ title: '播放失败', icon: 'none' })
        }
        return
      }
      that.setData({ playing: false, loadingSong: false })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })

    bgAudio.onEnded(() => {
      that.setData({ playing: false })
      that._handleSongEnd()
    })

    bgAudio.onPause(() => {
      that.setData({ playing: false })
      app.globalData.player.playing = false
    })

    // ⭐ onStop：用户从系统控件（锁屏/通知栏）停止播放
    bgAudio.onStop(() => {
      that.setData({ playing: false, loadingSong: false })
      app.globalData.player.playing = false
      that._audioConfirmed = false
      that._audioStopped = true
      that._clearAudioTimers()
    })

    // ⭐ 系统媒体控件：下一首/上一首（锁屏/通知栏/车载蓝牙）
    bgAudio.onNext(() => { that.onNext() })
    bgAudio.onPrev(() => { that.onPrev() })

    this._audio = bgAudio
  },

  // 清除安全网定时器
  _clearAudioTimers() {
    if (this._audioRetryTimer) { clearTimeout(this._audioRetryTimer); this._audioRetryTimer = null }
    if (this._audioFallbackTimer) { clearTimeout(this._audioFallbackTimer); this._audioFallbackTimer = null }
  },

  // 设置 BackgroundAudioManager 的 src（自动播放）
  _setBgAudioSrc(src) {
    const song = this.data.currentSong
    if (song) {
      this._audio.title = song.name || song.title || '正在播放'
      this._audio.singer = song.artist || '未知艺人'
      if (song.cover) this._audio.coverImgUrl = song.cover
      if (song.album) this._audio.epname = song.album
    }
    this._audioSrc = src
    this._audio.src = src
  },

  // 创建并播放音频（BackgroundAudioManager 单例，设置 src 即自动播放）
  _createAudio(src) {
    if (!src) {
      this.setData({ loadingSong: false })
      return wx.showToast({ title: '暂无可用音源', icon: 'none' })
    }
    console.log('[Audio] _createAudio:', src.substring(0, 80))

    // 重置状态
    this._audioConfirmed = false
    this._audioFallbackTried = false
    this._audioDownloadTried = false
    this._audioStopped = false
    this._clearAudioTimers()

    // 设置元数据 + src（BackgroundAudioManager 设置 src 即自动播放）
    this._setBgAudioSrc(src)

    // ⭐ 安全网 1：2s 内 onTimeUpdate 没触发 → 再调一次 play()
    this._audioRetryTimer = setTimeout(() => {
      if (this._audioConfirmed) return
      console.log('[Audio] 2s 内 onTimeUpdate 未触发，重试 play()')
      try { this._audio.play() } catch(e) {}
    }, 2000)

    // ⭐ 安全网 2：5s 内还没确认 → 先试 stream=1，再下载兜底
    this._audioFallbackTimer = setTimeout(() => {
      if (this._audioConfirmed) return
      console.warn('[Audio] 5s 超时 → 走兜底')
      this._clearAudioTimers()
      if (src.startsWith('http') && !src.startsWith('wxfile://')) {
        if (!src.includes('stream=1') && !this._audioFallbackTried) {
          this._audioFallbackTried = true
          console.log('[Audio] 超时 → 尝试 stream=1 代理流')
          this._setBgAudioSrc(src + '&stream=1')
        } else if (!this._audioDownloadTried) {
          this._audioDownloadTried = true
          this._downloadAsFallback(src)
        } else {
          this.setData({ playing: false, loadingSong: false })
          wx.showToast({ title: '播放超时', icon: 'none' })
        }
      } else {
        this.setData({ playing: false, loadingSong: false })
        wx.showToast({ title: '播放超时', icon: 'none' })
      }
    }, 5000)
  },

  // 下载音频到本地作为兜底
  _downloadAsFallback(src) {
    if (this._fallbackDownloading) return
    this._fallbackDownloading = true
    console.log('[Audio] 兜底下载:', src.substring(0, 60))
    wx.downloadFile({
      url: src,
      timeout: 20000,
      success: (res) => {
        this._fallbackDownloading = false
        if (res.statusCode === 200 && res.tempFilePath) {
          console.log('[Audio] 下载完成:', res.tempFilePath)
          // 持久化到 wxfile://
          wx.getFileSystemManager().saveFile({
            tempFilePath: res.tempFilePath,
            success: (sf) => {
              console.log('[Audio] savedFilePath:', sf.savedFilePath)
              this.setData({ 'playSong.url': sf.savedFilePath })
              this._setBgAudioSrc(sf.savedFilePath)
            },
            fail: () => {
              this.setData({ 'playSong.url': res.tempFilePath })
              this._setBgAudioSrc(res.tempFilePath)
            }
          })
        } else {
          this.setData({ loadingSong: false })
          wx.showToast({ title: '音频加载失败', icon: 'none' })
        }
      },
      fail: (err) => {
        this._fallbackDownloading = false
        console.error('[Audio] 兜底下载失败:', err)
        this.setData({ loadingSong: false })
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      }
    })
  },

  _handleSongEnd() {
    const { playMode, playlist, currentSong } = this.data
    const ci = playlist.findIndex(s => s.id === currentSong?.id)
    if (playMode === 2 && this._audio) {
      // BackgroundAudioManager: onEnded 后需重新设置 src 才能重播
      const src = this._audioSrc
      if (src) {
        this._audioConfirmed = false
        this._setBgAudioSrc(src)
      }
    }
    else if (playMode === 1) this._playFromList(~~(Math.random() * playlist.length))
    else if (ci >= 0 && ci < playlist.length - 1) this._playFromList(ci + 1)
  },

  onTogglePlay() {
    // BackgroundAudioManager 是单例，始终存在；检查是否有 src 或已被系统停止
    if (!this._audio || !this._audio.src || this._audioStopped) {
      this._audioStopped = false
      if (this.data.playSong?.url) { this.setData({ loadingSong: true }); this._createAudio(this.data.playSong.url) }
      return
    }
    // ⭐ 用 _audio.paused 真实状态做判断（不依赖 data.playing，避免事件未到时的状态错乱）
    if (this._audio.paused) {
      this._audio.play()
    } else {
      this._audio.pause()
    }
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
      this.setData({ cfActiveIdx: n, cfFlippedIdx: -1 })
      wx.vibrateShort({ type: 'light' }).catch(() => {})
    }
    this._cfStart = e.touches[0].clientX; this._cfAccum = 0
  },
  onCFTouchEnd() { this._cfStart = null; this._cfAccum = 0 },
  onCFTap(e) {
    const idx = +e.currentTarget.dataset.idx
    if (idx === this.data.cfActiveIdx) {
      // 已选中：翻转卡片或进入歌曲列表
      if (this.data.cfFlippedIdx !== idx) {
        // 第一次点击 → 翻转看背面
        this.setData({ cfFlippedIdx: idx })
        wx.vibrateShort({ type: 'light' }).catch(() => {})
      } else {
        // 再次点击 → 进入歌曲列表
        this._openAlbum(this.data.coverFlowData[idx])
      }
    } else {
      // 选中新专辑时清除翻转状态
      this.setData({ cfActiveIdx: idx, cfFlippedIdx: -1 })
      wx.vibrateShort({ type: 'light' }).catch(() => {})
    }
  },

  // 点击 Cover Flow 卡片：拉取该专辑全部歌曲
  _openAlbum(album) {
    if (!album) return
    const that = this

    // 立即展示已收藏的该专辑歌曲（本地数据），后续异步更新
    this.setData({
      albumSongs: album.songs || [],
      albumName: album.name,
      albumCover: album.cover || '/static/default-cover.png',
      menuIndex: 0,
    })
    this._pushView('albumsongs')
    wx.vibrateShort({ type: 'medium' }).catch(() => {})

    // 用 albumId（可能是 picId）尝试拉取完整专辑；失败则走搜索替补
    this._fetchAlbumSongs(album.albumId, album)
  },

  // 用后端 /api/music/album 接口拉取专辑歌曲（支持 picId 精准过滤）
  _fetchAlbumSongs(albumId, album) {
    if (!album) return
    const BASE = 'https://ty-music.onrender.com'
    const that = this

    // picId 优先从 album.picId 取，其次从收藏歌曲取
    const firstSong = album.songs && album.songs[0]
    const picId = album.picId || (firstSong && firstSong.picId) || albumId || ''

    wx.showLoading({ title: '加载专辑歌曲...' })

    // 使用 /api/music/album 接口（后端会搜索 + 按 picId 过滤）
    const params = 'picId=' + encodeURIComponent(picId) +
                   '&album=' + encodeURIComponent(album.name || '') +
                   '&artist=' + encodeURIComponent((album.artist || '').split(',')[0].trim()) +
                   '&limit=150'
    const url = BASE + '/api/music/album?' + params
    console.log('[Album] Fetching:', url)

    wx.request({
      url: url,
      timeout: 15000,
      success: function(res) {
        wx.hideLoading()
        if (res.statusCode === 200 && res.data && res.data.songs && res.data.songs.length > 0) {
          const songs = res.data.songs.map(function(s) { return that._norm(s) })
          that.setData({
            albumSongs: songs,
            albumName: album.name,
            albumCover: album.cover || '/static/default-cover.png',
          })
          wx.showToast({ title: '共 ' + songs.length + ' 首', icon: 'none', duration: 1200 })
          console.log('[Album] Loaded', songs.length, 'songs for', album.name)
        } else {
          // 后端接口返回空，走前端搜索替补
          console.log('[Album] /api/music/album returned empty, fallback to search')
          that._searchAlbumSongs(album)
        }
      },
      fail: function(err) {
        wx.hideLoading()
        console.log('[Album] Fetch failed:', err && err.message ? err.message : err)
        that._searchAlbumSongs(album)
      }
    })
  },

  // 前端搜索替补：用专辑名 + 艺人搜索，按 picId 过滤
  _searchAlbumSongs(album) {
    const BASE = 'https://ty-music.onrender.com'
    const that = this

    wx.showLoading({ title: '搜索专辑歌曲...' })

    // 用专辑名 + 艺人名搜索（比歌名搜索更能覆盖整张专辑）
    const primaryArtist = (album.artist || '').split(',')[0].trim()
    const query = (primaryArtist && album.name)
      ? (primaryArtist + ' ' + album.name)
      : (album.name || primaryArtist || '')

    const searchUrl = BASE + '/api/music/search?keywords=' + encodeURIComponent(query) + '&limit=50'
    console.log('[Album] Searching:', searchUrl)

    wx.request({
      url: searchUrl,
      timeout: 15000,
      success: function(res) {
        wx.hideLoading()
        if (res.statusCode === 200 && res.data && res.data.songs && res.data.songs.length > 0) {
          const songs = res.data.songs

          // 策略1：按 picId 过滤（同一专辑的歌曲 picId 相同）
          const firstSong = album.songs && album.songs[0]
          const targetPicId = (firstSong && firstSong.picId) || album.albumId || ''
          let filtered = []
          if (targetPicId) {
            filtered = songs.filter(function(s) {
              return String(s.picId || '') === String(targetPicId)
            })
          }

          // 策略2：按专辑名精确匹配
          if (filtered.length < 2) {
            const targetAlbum = (album.name || '').toLowerCase().trim()
            if (targetAlbum) {
              filtered = songs.filter(function(s) {
                return (s.album || '').toLowerCase().trim() === targetAlbum
              })
            }
          }

          if (filtered.length > 0) {
            const normed = filtered.map(function(s) { return that._norm(s) })
            that.setData({
              albumSongs: normed,
              albumName: album.name,
              albumCover: album.cover || '/static/default-cover.png',
            })
            wx.showToast({ title: '共 ' + normed.length + ' 首', icon: 'none', duration: 1200 })
            console.log('[Album] Loaded', normed.length, 'songs via search for', album.name)
          } else {
            that._showLocalAlbumSongs(album)
          }
        } else {
          that._showLocalAlbumSongs(album)
        }
      },
      fail: function() {
        wx.hideLoading()
        that._showLocalAlbumSongs(album)
      }
    })
  },

  _showLocalAlbumSongs(album) {
    const localSongs = album.songs || []
    wx.showToast({ title: '共 ' + localSongs.length + ' 首', icon: 'none', duration: 1200 })
    console.log('[Album] Using local songs:', localSongs.length)
  },

  onAlbumSongTap(e) {
    const idx = +e.currentTarget.dataset.idx
    const song = this.data.albumSongs[idx]
    if (song) this._play(song)
  },

  /* ============ 滚轮 ============ */
  onWheelTouchStart(e) {
    this._wStart = e.touches[0]; this._wAccum = 0; this._wLastStep = 0; this._wLastStepTime = 0
    /* 每次触摸开始时刷新轮盘中心坐标，防止布局变化后坐标过期 */
    if (!this._wheelCenter) {
      this._queryWheelCenter()
    }
  },

  _scrollTarget(view, idx) {
    const m = { menu: 'mi', onlinemusic: 'omi', search: 'si', hot: 'hi', localmusic: 'li', settings: 'seti', albumsongs: 'asi' }
    const p = m[view]; return p ? (p + '-' + idx) : ''
  },

  /* 右侧滚动指示条 — 监听 scroll-view 滚动 */
  onListScroll(e) {
    const { scrollTop, scrollHeight } = e.detail
    if (!scrollHeight || scrollHeight < 10) return
    const view = this.data.currentView
    const cacheKey = '_svH_' + view
    if (this[cacheKey]) {
      this._updateScrollBar(scrollTop, scrollHeight, this[cacheKey])
    } else {
      const sel = view === 'localmusic' ? '.ipod-local-list' : '.ipod-menu'
      wx.createSelectorQuery().select(sel).boundingClientRect(rect => {
        if (rect && rect.height > 0) {
          this[cacheKey] = rect.height
          this._updateScrollBar(scrollTop, scrollHeight, rect.height)
        }
      }).exec()
    }
  },

  _updateScrollBar(scrollTop, scrollHeight, viewportH) {
    if (scrollHeight <= viewportH + 5) {
      if (this.data.scrollBarVisible) this.setData({ scrollBarVisible: false })
      return
    }
    const barHeight = Math.max(10, (viewportH / scrollHeight) * 100)
    const barTop = Math.min(100 - barHeight, (scrollTop / scrollHeight) * 100)
    this.setData({ scrollBarTop: barTop, scrollBarHeight: barHeight, scrollBarVisible: true })
    clearTimeout(this._scrollBarTimer)
    this._scrollBarTimer = setTimeout(() => {
      this.setData({ scrollBarVisible: false })
    }, 1200)
  },

  onWheelTouchMove(e) {
    if (!this._wStart) return
    const t = e.touches[0]
    /* 使用动态获取的轮盘中心，而非硬编码值 */
    const c = this._wheelCenter
    if (!c) return  /* 中心坐标未获取时不处理，防止角度计算错误 */
    const a1 = Math.atan2(this._wStart.clientY - c.y, this._wStart.clientX - c.x) * (180 / Math.PI)
    const a2 = Math.atan2(t.clientY - c.y, t.clientX - c.x) * (180 / Math.PI)
    let d = a2 - a1
    if (d > 180) d -= 360; if (d < -180) d += 360
    this._wAccum += d; this._wStart = t

    /* 22度一步，手感更沉稳，小幅度滑动不会过快翻页 */
    const STEP_DEG = 22
    const steps = Math.round(this._wAccum / STEP_DEG)
    if (steps === 0 || steps === this._wLastStep) return
    /* 节流：每次 touchmove 最多只走1步，防止快速连跳 */
    const delta = steps > this._wLastStep ? 1 : -1
    this._wLastStep = steps
    /* 节流：两次步进之间至少间隔 80ms */
    const now = Date.now()
    if (this._wLastStepTime && now - this._wLastStepTime < 80) return
    this._wLastStepTime = now
    wx.vibrateShort({ type: 'light' }).catch(() => {})

    const { currentView, menuIndex, subMenuIndex, settingsIndex, playlist, searchResults, localSongs } = this.data
    if (currentView === 'menu') {
      const n = ((menuIndex + delta) % 5 + 5) % 5
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('menu', n) })
    } else if (currentView === 'onlinemusic') {
      const n = ((subMenuIndex + delta) % 2 + 2) % 2
      this.setData({ subMenuIndex: n, wheelScrollTarget: this._scrollTarget('onlinemusic', n) })
    } else if (currentView === 'settings') {
      const n = ((settingsIndex + delta) % 3 + 3) % 3
      this.setData({ settingsIndex: n, wheelScrollTarget: this._scrollTarget('settings', n) })
    } else if (currentView === 'search' && searchResults.length > 0) {
      const n = ((menuIndex + delta) % searchResults.length + searchResults.length) % searchResults.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('search', n) })
    } else if (currentView === 'hot' && playlist.length > 0) {
      const n = ((menuIndex + delta) % playlist.length + playlist.length) % playlist.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('hot', n) })
    } else if (currentView === 'localmusic' && localSongs.length > 0) {
      const n = ((menuIndex + delta) % localSongs.length + localSongs.length) % localSongs.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('localmusic', n) })
    } else if (currentView === 'nowplaying' && this._audio && this.data.duration > 0)
      this._audio.seek(Math.max(0, Math.min(this.data.duration, (this._audio.currentTime || 0) + delta * 2)))
    else if (currentView === 'coverflow')
      this.setData({ cfActiveIdx: Math.max(0, Math.min(this.data.coverFlowData.length - 1, this.data.cfActiveIdx + delta)), cfFlippedIdx: -1 })
    else if (currentView === 'albumsongs' && this.data.albumSongs.length > 0) {
      const n = ((menuIndex + delta) % this.data.albumSongs.length + this.data.albumSongs.length) % this.data.albumSongs.length
      this.setData({ menuIndex: n, wheelScrollTarget: this._scrollTarget('albumsongs', n) })
    }
  },

  onWheelTouchEnd() { this._wStart = null; this._wAccum = 0; this._wLastStep = 0; this._wLastStepTime = 0 },

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
    // BackgroundAudioManager 是单例，不能 destroy；后台播放继续
    this._clearAudioTimers()
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
