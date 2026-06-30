/* ============================================
   TY Pod — 全局主体
   iOS 26 液态玻璃 · 浅霓虹色
   ============================================ */

App({
  onLaunch() {
    const sys = wx.getWindowInfo()
    this.globalData.winW = sys.windowWidth  || 375
    this.globalData.winH = sys.windowHeight || 667
    this.globalData.safeTop = sys.statusBarHeight || 20

    const theme = wx.getStorageSync('typod_theme')
    if (theme) { this.globalData.bodyColor = theme }

    const mode = wx.getStorageSync('typod_playmode')
    if (typeof mode === 'number') this.globalData.playMode = mode
    else if (mode === 'sequential')   this.globalData.playMode = 0
    else if (mode === 'shuffle')      this.globalData.playMode = 1
    else if (mode === 'repeat-one')   this.globalData.playMode = 2

    const favs = wx.getStorageSync('typod_favs')
    if (favs) this.globalData.favorites = favs
  },

  globalData: {
    winW: 375,
    winH: 667,
    safeTop: 20,

    bodyColor: 'silver',
    playMode: 0,
    backlight: true,

    player: {
      playing: false,
      currentSong: null,
      currentTime: 0,
      playlist: [],
      index: -1
    },

    favorites: []
  },

  /* ============ 主题色 — 7色金属质感 ============ */
  getThemeCSSVars() {
    return ''
  },

  saveTheme(name) {
    this.globalData.bodyColor = name
    wx.setStorageSync('typod_theme', name)
  },
})
