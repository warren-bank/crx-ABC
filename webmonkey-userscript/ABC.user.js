// ==UserScript==
// @name         ABC
// @description  Watch videos in external player.
// @version      1.0.0
// @match        *://abc.com/*
// @match        *://*.abc.com/*
// @icon         https://abc.com/favicon.ico
// @run-at       document-end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-ABC/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-ABC/issues
// @downloadURL  https://github.com/warren-bank/crx-ABC/raw/webmonkey-userscript/es5/webmonkey-userscript/ABC.user.js
// @updateURL    https://github.com/warren-bank/crx-ABC/raw/webmonkey-userscript/es5/webmonkey-userscript/ABC.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- constants

var user_options = {
  "common": {
    "preferred_language":           "en-us",

    "rewrite_show_pages":           true,
    "sort_newest_first":            true
  },
  "webmonkey": {
    "post_intent_redirect_to_url":  "about:blank"
  },
  "greasemonkey": {
    "redirect_to_webcast_reloaded": true,
    "force_http":                   true,
    "force_https":                  false
  }
}

// ----------------------------------------------------------------------------- state

var state = {
  "videos":          null,
  "did_rewrite_dom": false
}

// ----------------------------------------------------------------------------- helpers (state)

var get_video = function(video_index) {
  return (state.videos && (video_index < state.videos.length))
    ? state.videos[video_index]
    : null
}

// ----------------------------------------------------------------------------- helpers (DOM)

var make_element = function(elementName, content, is_text_content) {
  var el = unsafeWindow.document.createElement(elementName)

  if (content) {
    if (is_text_content)
      el.innerText = content
    else
      el.innerHTML = content
  }

  return el
}

// ------------------------------------- helpers (unused)

var make_span = function(text) {return make_element('span', text)}
var make_h4   = function(text) {return make_element('h4',   text)}

// -------------------------------------

var cancel_event = function(event){
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// ----------------------------------------------------------------------------- helpers (data structures)

var convert_raw_video = function(raw_video, raw_link) {
  var video = null
  var brand, show_id, video_type, video_id, locked, url, date

  if (raw_video instanceof Object) {
    try {
      brand      = raw_video.brand || '001'
      show_id    = ((raw_video.show instanceof Object) && raw_video.show.id)
                     ? raw_video.show.id
                     : '-1'
      video_type = raw_video.type || 'lf'
      video_id   = raw_video.id
      locked     = raw_video.accesslevel && (raw_video.accesslevel !== "0")
      url        = ((raw_link instanceof Object) && raw_link.urlValue) ? raw_link.urlValue : null
      date       = raw_video.airtime ? (new Date(raw_video.airtime)).toLocaleDateString()  : null

      video = {
        brand:       brand,
        show_id:     show_id,
        video_type:  video_type,
        video_id:    video_id,
        locked:      locked,
        url:         url,
        date:        date,
        description: raw_video.longdescription || raw_video.description || '',
        title:       raw_video.title           || '',
        season:      raw_video.seasonnumber    || '',
        episode:     raw_video.episodenumber   || '',
        duration:    raw_video.duration        || 0,
      }
    }
    catch(e) {}
  }

  return video
}

// ----------------------------------------------------------------------------- helpers (xhr)

var serialize_xhr_body_object = function(data) {
  if (typeof data === 'string')
    return data

  if (!(data instanceof Object))
    return null

  var body = []
  var keys = Object.keys(data)
  var key, val
  for (var i=0; i < keys.length; i++) {
    key = keys[i]
    val = data[key]
    val = unsafeWindow.encodeURIComponent(val)

    body.push(key + '=' + val)
  }
  body = body.join('&')
  return body
}

var download_text = function(url, headers, data, callback) {
  if (data) {
    if (!headers)
      headers = {}
    if (!headers['content-type'])
      headers['content-type'] = 'application/x-www-form-urlencoded'

    data = serialize_xhr_body_object(data)
  }

  var xhr    = new unsafeWindow.XMLHttpRequest()
  var method = data ? 'POST' : 'GET'

  xhr.open(method, url, true, null, null)

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(xhr.responseText)
      }
    }
  }

  if (data)
    xhr.send(data)
  else
    xhr.send()
}

var download_json = function(url, headers, data, callback) {
  download_text(url, headers, data, function(text){
    if (!headers) headers = {}
    headers.accept = 'application/json'

    try {
      callback(JSON.parse(text))
    }
    catch(e) {}
  })
}

// -----------------------------------------------------------------------------

var download_video_url = function(video_index, callback) {
  var video = get_video(video_index)
  if (!video) return

  var language_filter = function(obj) {
    if (!obj || !(obj instanceof Object))
      return false

    if (!user_options.common.preferred_language)
      return true

    return (obj.lang.indexOf(user_options.common.preferred_language) === 0)
  }

  var url, headers, data, xhr_callback

  url     = 'https://api.contents.watchabc.go.com/vp2/ws/contents/3000/videos/' + video.brand + '/001/-1/' + video.show_id + '/-1/' + video.video_id + '/-1/-1.json'
  headers = null
  data    = null
  video   = null

  xhr_callback = function(json) {
    var video_url, video_type, caption_url
    var videos, assets, filtered_assets, asset

    var process_video_asset = function(obj) {
      if (video_url || !obj || !(obj instanceof Object))
        return

      if (obj.value && (obj.value.toLowerCase().indexOf('.m3u8') >= 0)) {
        video_url  = obj.value
        video_type = 'application/x-mpegurl'
      }
    }

    var process_caption_asset = function(obj) {
      if (caption_url || !obj || !(obj instanceof Object))
        return

      if (obj.type && obj.value && (obj.type.toLowerCase() === 'ttml'))
        caption_url = obj.value + '#captions.ttml'
    }

    try {
      if (Array.isArray(json.video))
        videos = json.video
      else if (json.video instanceof Object)
        videos = [json.video]

      if (!videos || !videos.length)
        return

      for (var i1=0; i1 < videos.length; i1++) {
        video = videos[i1]

        if (!(video instanceof Object))
          continue

        if ((video.assets instanceof Object) && video.assets.asset) {
          if (Array.isArray(video.assets.asset))
            assets = video.assets.asset
          else if (video.assets.asset instanceof Object)
            assets = [video.assets.asset]

          if (assets && assets.length) {
            filtered_assets = assets.filter(language_filter)

            if ((filtered_assets.length > 0) && (filtered_assets.length < assets.length)) {
              for (var i2=0; !video_url && (i2 < filtered_assets.length); i2++) {
                asset = filtered_assets[i2]
                process_video_asset(asset)
              }
            }

            for (var i2=0; !video_url && (i2 < assets.length); i2++) {
              asset = assets[i2]
              process_video_asset(asset)
            }
          }
        }

        if ((video.closedcaption instanceof Object) && video.closedcaption.src) {
          if (Array.isArray(video.closedcaption.src))
            assets = video.closedcaption.src
          else if (video.closedcaption.src instanceof Object)
            assets = [video.closedcaption.src]

          if (assets && assets.length) {
            filtered_assets = assets.filter(language_filter)

            if ((filtered_assets.length > 0) && (filtered_assets.length < assets.length)) {
              for (var i2=0; !caption_url && (i2 < filtered_assets.length); i2++) {
                asset = filtered_assets[i2]
                process_caption_asset(asset)
              }
            }

            for (var i2=0; !caption_url && (i2 < assets.length); i2++) {
              asset = assets[i2]
              process_caption_asset(asset)
            }
          }
        }
      }

      if (video_url)
        callback({video_url: video_url, video_type: video_type, caption_url: caption_url})
    }
    catch(e) {}
  }

  download_json(url, headers, data, xhr_callback)
}

// -----------------------------------------------------------------------------

var download_video_authorization = function(video_index, callback) {
  var video = get_video(video_index)
  if (!video) return

  var url, headers, data, xhr_callback

  url     = 'https://api.entitlement.watchabc.go.com/vp2/ws-secure/entitlement/2020/authorize.json'
  headers = null
  data    = {
    device:     '001',
    brand:      video.brand,
    video_type: video.video_type,
    video_id:   video.video_id
  }

  xhr_callback = function(json) {
    var video_authorization

    try {
      video_authorization = json.uplynkData.sessionKey

      if (video_authorization)
        callback(video_authorization)
    }
    catch(e) {}
  }

  download_json(url, headers, data, xhr_callback)
}

// -----------------------------------------------------------------------------

var download_video_url_with_authorization = function(video_index, callback) {
  var xhr_callback_url = function(media) {
    var xhr_callback_authorization = function(video_authorization) {
      media.video_url += '?' + video_authorization

      callback(media)
    }

    download_video_authorization(video_index, xhr_callback_authorization)
  }

  download_video_url(video_index, xhr_callback_url)
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url = function(video_url, caption_url, referer_url, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.greasemonkey.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.greasemonkey.force_https

  var encoded_video_url, encoded_caption_url, encoded_referer_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url     = encodeURIComponent(encodeURIComponent(btoa(video_url)))
  encoded_caption_url   = caption_url ? encodeURIComponent(encodeURIComponent(btoa(caption_url))) : null
  referer_url           = referer_url ? referer_url : unsafeWindow.location.href
  encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.surge.sh/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base + '#/watch/' + encoded_video_url + (encoded_caption_url ? ('/subtitle/' + encoded_caption_url) : '') + '/referer/' + encoded_referer_url
  return webcast_reloaded_url
}

// ----------------------------------------------------------------------------- URL redirect

var redirect_to_url = function(url) {
  if (!url) return

  if (typeof GM_loadUrl === 'function') {
    if (typeof GM_resolveUrl === 'function')
      url = GM_resolveUrl(url, unsafeWindow.location.href) || url

    GM_loadUrl(url, 'Referer', unsafeWindow.location.href)
  }
  else {
    try {
      unsafeWindow.top.location = url
    }
    catch(e) {
      unsafeWindow.window.location = url
    }
  }
}

var process_webmonkey_post_intent_redirect_to_url = function() {
  var url = null

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'string')
    url = user_options.webmonkey.post_intent_redirect_to_url

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'function')
    url = user_options.webmonkey.post_intent_redirect_to_url()

  if (typeof url === 'string')
    redirect_to_url(url)
}

var process_video_data = function(data) {
  if (!data.video_url) return

  if (!data.referer_url)
    data.referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    var args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ data.video_url,
      /* type   = */ data.video_type
    ]

    // extras:
    if (data.caption_url) {
      args.push('textUrl')
      args.push(data.caption_url)
    }
    if (data.referer_url) {
      args.push('referUrl')
      args.push(data.referer_url)
    }
    if (data.drm.scheme) {
      args.push('drmScheme')
      args.push(data.drm.scheme)
    }
    if (data.drm.server) {
      args.push('drmUrl')
      args.push(data.drm.server)
    }
    if (data.drm.headers && (typeof data.drm.headers === 'object')) {
      var drm_header_keys, drm_header_key, drm_header_val

      drm_header_keys = Object.keys(data.drm.headers)
      for (var i=0; i < drm_header_keys.length; i++) {
        drm_header_key = drm_header_keys[i]
        drm_header_val = data.drm.headers[drm_header_key]

        args.push('drmHeader')
        args.push(drm_header_key + ': ' + drm_header_val)
      }
    }

    GM_startIntent.apply(this, args)
    process_webmonkey_post_intent_redirect_to_url()
    return true
  }
  else if (user_options.greasemonkey.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(get_webcast_reloaded_url(data.video_url, data.caption_url, data.referer_url))
    return true
  }
  else {
    return false
  }
}

// -------------------------------------

var process_video_url = function(video_url, video_type, caption_url, referer_url) {
  var data = {
    drm: {
      scheme:    null,
      server:    null,
      headers:   null
    },
    video_url:   video_url   || null,
    video_type:  video_type  || null,
    caption_url: caption_url || null,
    referer_url: referer_url || null
  }

  process_video_data(data)
}

// ------------------------------------- helpers (unused)

var process_hls_data = function(data) {
  data.video_type = 'application/x-mpegurl'
  process_video_data(data)
}

var process_dash_data = function(data) {
  data.video_type = 'application/dash+xml'
  process_video_data(data)
}

// ------------------------------------- helpers (unused)

var process_hls_url = function(video_url, caption_url, referer_url) {
  process_video_url(video_url, /* video_type= */ 'application/x-mpegurl', caption_url, referer_url)
}

var process_dash_url = function(video_url, caption_url, referer_url) {
  process_video_url(video_url, /* video_type= */ 'application/dash+xml', caption_url, referer_url)
}

// ----------------------------------------------------------------------------- process video

var process_video = function(video_index, callback) {
  if (!callback)
    callback = process_video_data

  download_video_url_with_authorization(video_index, callback)
}

// ----------------------------------------------------------------------------- rewrite DOM to display all available full-episodes for show

// ------------------------------------- constants

var strings = {
  "button_download_video":          "Get Video URL",
  "button_start_video":             "Start Video",
  "episode_labels": {
    "title":                        "title:",
    "episode":                      "episode:",
    "date_release":                 "date:",
    "time_duration":                "duration:",
    "summary":                      "summary:"
  },
  "episode_units": {
    "duration_hour":                "hour",
    "duration_hours":               "hours",
    "duration_minutes":             "minutes"
  }
}

var constants = {
  "dom_classes": {
    "div_episodes":                 "episodes",
    "div_webcast_icons":            "icons-container"
  },
  "img_urls": {
    "icon_lock":                    "https://github.com/warren-bank/crx-ABC/raw/webmonkey-userscript/es5/webmonkey-userscript/img/black.lock.outline.png",
    "base_webcast_reloaded_icons":  "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

// -------------------------------------  helpers

var repeat_string = function(str, count) {
  var rep = ''
  for (var i=0; i < count; i++)
    rep += str
  return rep
}

var pad_zeros = function(num, len) {
  var str = num.toString()
  var pad = len - str.length
  if (pad > 0)
    str = repeat_string('0', pad) + str
  return str
}

// -------------------------------------  URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url_chromecast_sender = function(video_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(video_url, caption_url, referer_url, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

var get_webcast_reloaded_url_airplay_sender = function(video_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(video_url, caption_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

var get_webcast_reloaded_url_proxy = function(hls_url, caption_url, referer_url) {
  return get_webcast_reloaded_url(hls_url, caption_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

// -------------------------------------  DOM: static skeleton

var reset_dom = function() {
  unsafeWindow.document.close()
  unsafeWindow.document.write('')
  unsafeWindow.document.close()
}

var reinitialize_dom = function() {
  reset_dom()

  var head = unsafeWindow.document.getElementsByTagName('head')[0]
  var body = unsafeWindow.document.body

  var html = {
    "head": [
      '<style>',

      // --------------------------------------------------- CSS: global

      'body {',
      '  background-color: #fff !important;',
      '  text-align: left;',
      '}',

      // --------------------------------------------------- CSS: episodes

      'div.' + constants.dom_classes.div_episodes + ' > ul {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '  padding-left: 1em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li {',
      '  list-style: none;',
      '  margin-top: 0.5em;',
      '  border-top: 1px solid #999;',
      '  padding-top: 0.5em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table {',
      '  min-height: 70px;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table td:first-child {',
      '  font-style: italic;',
      '  padding-right: 1em;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table td > div.locked {',
      '  display: inline-block;',
      '  width:  1em;',
      '  height: 1em;',
      '  margin-right: 0.5em;',
      '  background-image: url("' + constants.img_urls.icon_lock + '");',
      '  background-repeat: no-repeat;',
      '  background-size: 100% 100%;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > table td > a {',
      '  display: inline-block;',
      '  margin: 0;',
      '  color: blue;',
      '  text-decoration: none;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > blockquote {',
      '  display: block;',
      '  background-color: #eee;',
      '  padding: 0.5em 1em;',
      '  margin: 0;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > button {',
      '  margin: 0.75em 0;',
      '}',

      'div.' + constants.dom_classes.div_episodes + ' > ul > li > div.' + constants.dom_classes.div_webcast_icons + ' {',
      '}',

      // --------------------------------------------------- CSS: EPG data (links to tools on Webcast Reloaded website)

      'div.' + constants.dom_classes.div_webcast_icons + ' {',
      '  display: block;',
      '  position: relative;',
      '  z-index: 1;',
      '  float: right;',
      '  margin: 0.5em;',
      '  width: 60px;',
      '  height: 60px;',
      '  max-height: 60px;',
      '  vertical-align: top;',
      '  background-color: #d7ecf5;',
      '  border: 1px solid #000;',
      '  border-radius: 14px;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy > img,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link > img {',
      '  display: block;',
      '  width: 25px;',
      '  height: 25px;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  position: absolute;',
      '  z-index: 1;',
      '  text-decoration: none;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay {',
      '  top: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  bottom: 0;',
      '}',

      'div.' + constants.dom_classes.div_webcast_icons + ' > a.chromecast,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.proxy {',
      '  left: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay,',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.video-link {',
      '  right: 0;',
      '}',
      'div.' + constants.dom_classes.div_webcast_icons + ' > a.airplay + a.video-link {',
      '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
      '}',

      '</style>'
    ],
    "body": [
      '<div class="' + constants.dom_classes.div_episodes + '"></div>'
    ]
  }

  head.innerHTML = '' + html.head.join("\n")
  body.innerHTML = '' + html.body.join("\n")
}

// ------------------------------------- DOM: dynamic elements - episodes

var make_webcast_reloaded_div = function(video_url, caption_url, referer_url) {
  var webcast_reloaded_urls = {
//  "index":             get_webcast_reloaded_url(                  video_url, caption_url, referer_url),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_url, caption_url, referer_url),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_url, caption_url, referer_url),
    "proxy":             get_webcast_reloaded_url_proxy(            video_url, caption_url, referer_url)
  }

  var div = make_element('div')

  var html = [
    '<a target="_blank" class="chromecast" href="' + webcast_reloaded_urls.chromecast_sender + '" title="Chromecast Sender"><img src="'       + constants.img_urls.base_webcast_reloaded_icons + 'chromecast.png"></a>',
    '<a target="_blank" class="airplay" href="'    + webcast_reloaded_urls.airplay_sender    + '" title="ExoAirPlayer Sender"><img src="'     + constants.img_urls.base_webcast_reloaded_icons + 'airplay.png"></a>',
    '<a target="_blank" class="proxy" href="'      + webcast_reloaded_urls.proxy             + '" title="HLS-Proxy Configuration"><img src="' + constants.img_urls.base_webcast_reloaded_icons + 'proxy.png"></a>',
    '<a target="_blank" class="video-link" href="' + video_url                                 + '" title="direct link to video"><img src="'    + constants.img_urls.base_webcast_reloaded_icons + 'video_link.png"></a>'
  ]

  div.setAttribute('class', constants.dom_classes.div_webcast_icons)
  div.innerHTML = html.join("\n")

  return div
}

var insert_webcast_reloaded_div = function(block_element, video_url, caption_url, referer_url) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_url, caption_url, referer_url)

  if (block_element.childNodes.length)
    block_element.insertBefore(webcast_reloaded_div, block_element.childNodes[0])
  else
    block_element.appendChild(webcast_reloaded_div)
}

var download_video = function(video_index, block_element, old_button) {
  var callback = function(media) {
    insert_webcast_reloaded_div(block_element, media.video_url, media.caption_url)
    add_start_video_button(media.video_url, media.video_type, media.caption_url, block_element, old_button)
  }

  process_video(video_index, callback)
}

// -------------------------------------

var onclick_start_video_button = function(event) {
  cancel_event(event)

  var button      = event.target
  var video_url   = button.getAttribute('x-video-url')
  var video_type  = button.getAttribute('x-video-type')
  var caption_url = button.getAttribute('x-caption-url')

  if (video_url)
    process_video_url(video_url, video_type, caption_url)
}

var make_start_video_button = function(video_url, video_type, caption_url) {
  var button = make_element('button')

  button.setAttribute('x-video-url',   video_url)
  button.setAttribute('x-video-type',  video_type)
  button.setAttribute('x-caption-url', caption_url)
  button.innerHTML = strings.button_start_video
  button.addEventListener("click", onclick_start_video_button)

  return button
}

var add_start_video_button = function(video_url, video_type, caption_url, block_element, old_button) {
  var new_button = make_start_video_button(video_url, video_type, caption_url)

  if (old_button)
    old_button.parentNode.replaceChild(new_button, old_button)
  else
    block_element.appendChild(new_button)
}

// -------------------------------------

var convert_ms_to_mins = function(X) {
  // (X ms)(1 sec / 1000 ms)(1 min / 60 sec)
  return Math.ceil(X / 60000)
}

var get_ms_duration_time_string = function(ms) {
  var time_string = ''
  var mins = convert_ms_to_mins(ms)
  var hours

  if (mins >= 60) {
    hours       = Math.floor(mins / 60)
    time_string = hours + ' ' + ((hours < 2) ? strings.episode_units.duration_hour : strings.episode_units.duration_hours) + ', '
    mins        = mins % 60
  }

  return time_string + mins + ' ' + strings.episode_units.duration_minutes
}

var make_episode_listitem_html = function(video, video_index) {
  if (video.duration)
    video.duration = get_ms_duration_time_string(video.duration)

  var tr = []

  var append_tr = function(td, colspan) {
    if (Array.isArray(td))
      tr.push('<tr><td>' + td.join('</td><td>') + '</td></tr>')
    else if ((typeof colspan === 'number') && (colspan > 1))
      tr.push('<tr><td colspan="' + colspan + '">' + td + '</td></tr>')
    else
      tr.push('<tr><td>' + td + '</td></tr>')
  }

  if (video.title && video.url)
    video.title = '<a target="_blank" href="' + video.url + '">' + video.title + '</a>'
  if (video.locked)
    video.title = '<div class="locked"></div>' + video.title
  if (video.title)
    append_tr([strings.episode_labels.title, video.title])
  if (video.season && video.episode)
    append_tr([strings.episode_labels.episode, ('S' + pad_zeros(video.season, 2) + ' E' + pad_zeros(video.episode, 2))])
  if (video.date)
    append_tr([strings.episode_labels.date_release, video.date])
  if (video.duration)
    append_tr([strings.episode_labels.time_duration, video.duration])
  if (video.description)
    append_tr(strings.episode_labels.summary, 2)

  var html = ['<table>' + tr.join("\n") + '</table>']
  if (video.description)
    html.push('<blockquote>' + video.description + '</blockquote>')

  return '<li x-video-index="' + video_index + '">' + html.join("\n") + '</li>'
}

// -------------------------------------

var onclick_download_show_video_button = function(event) {
  cancel_event(event)

  var button, video_index, episodes_div, episode_item

  button = event.target

  video_index = button.getAttribute('x-video-index')
  if (!video_index) return

  video_index = parseInt(video_index, 10)
  if (isNaN(video_index)) return

  episodes_div = unsafeWindow.document.querySelector('div.' + constants.dom_classes.div_episodes)
  if (!episodes_div) return

  episode_item = episodes_div.querySelector('li[x-video-index="' + video_index + '"]')
  if (!episode_item) return

  download_video(video_index, /* block_element= */ episode_item, /* old_button= */ button)
}

var make_download_show_video_button = function(video_index) {
  var button = make_element('button')

  button.setAttribute('x-video-index', video_index)
  button.innerHTML = strings.button_download_video
  button.addEventListener("click", onclick_download_show_video_button)

  return button
}

var add_episode_div_buttons = function(episodes_div) {
  var episode_items = episodes_div.querySelectorAll('li[x-video-index]')
  var episode_item, video_index, button

  for (var i=0; i < episode_items.length; i++) {
    episode_item = episode_items[i]
    video_index  = episode_item.getAttribute('x-video-index')

    if (video_index) {
      button = make_download_show_video_button(video_index)
      episode_item.appendChild(button)
    }
  }
}

// -------------------------------------

var rewrite_show_page = function() {
  var episodes_div, html

  reinitialize_dom()

  episodes_div = unsafeWindow.document.querySelector('div.' + constants.dom_classes.div_episodes)
  if (!episodes_div) return

  html = '<ul>' + state.videos.map(make_episode_listitem_html).join("\n") + '</ul>'
  episodes_div.innerHTML = html

  add_episode_div_buttons(episodes_div)

  user_options.webmonkey.post_intent_redirect_to_url = null
  state.did_rewrite_dom = true
}

// ----------------------------------------------------------------------------- bootstrap

/*
 * ======
 * notes:
 * ======
 * - return value is a wrapper function
 */

var trigger_on_function_call = function(func, func_this, trigger) {
  if (typeof trigger !== 'function') return func

  return function() {
    func.apply((func_this || null), arguments)

    trigger()
  }
}

var wrap_history_state_mutations = function() {
  if (unsafeWindow.history && (typeof unsafeWindow.history.pushState === 'function'))
    unsafeWindow.history.pushState = trigger_on_function_call(unsafeWindow.history.pushState, unsafeWindow.history, init)

  if (unsafeWindow.history && (typeof unsafeWindow.history.replaceState === 'function'))
    unsafeWindow.history.replaceState = trigger_on_function_call(unsafeWindow.history.replaceState, unsafeWindow.history, init)

  unsafeWindow.onpopstate = function() {
    if (state.did_rewrite_dom)
      unsafeWindow.location.reload()
  }

  if (unsafeWindow.history && (typeof unsafeWindow.history.back === 'function'))
    unsafeWindow.history.back = trigger_on_function_call(unsafeWindow.history.back, unsafeWindow.history, unsafeWindow.onpopstate)
}

// -------------------------------------

var init = function() {
  var data, video, videos
  var is_episode, is_episode_list
  var scripts, script, prefix
  var modules, tiles

  if (unsafeWindow.window['__abc_com__'] instanceof Object)
    data = unsafeWindow.window['__abc_com__']

  if (!data) {
    try {
      scripts = unsafeWindow.document.querySelectorAll('script:not([src])')
      for (var i=0; i < scripts.length; i++) {
        script = scripts[i]
        script = script.innerText.trim()
        prefix = "window['__abc_com__']="

        if (script && (script.indexOf(prefix) === 0)) {
          script = script.substring(prefix.length, script.length)
          script = unsafeWindow.window.eval(script)

          if (script instanceof Object)
            data = script
        }
      }
    }
    catch(e) {}
  }

  if (!data) return

  is_episode      = (data.page.type === 'video') && (!data.page.subType || (data.page.subType === 'episode'))
  is_episode_list = (data.page.type === 'show')  && (!data.page.subType || (data.page.subType === 'episode-guide'))

  if (is_episode) {
    try {
      video = data.page.content.video.layout.video
      video = convert_raw_video(video)

      if (video) {
        state.videos = [video]

        if (!video.locked)
          process_video(0)
        else
          is_episode_list = true
      }
    }
    catch(e) {}
  }

  if (is_episode_list && user_options.common.rewrite_show_pages) {
    try {
      videos  = []
      modules = data.page.content.shell.module

      modules = modules.filter(function(module) {
        return (
             (module.type === 'tilegroup')
          && Array.isArray(module.tiles)
          && module.tiles.length
        )
      })

      for (var i1=0; i1 < modules.length; i1++) {
        try {
          tiles = modules[i1].tiles

          tiles = tiles.filter(function(tile) {
            return (
                 (tile.type === 'video')
              && (tile.video instanceof Object)
              && (tile.video.type === 'lf')
              && (tile.video.id)
              && (tile.video.id.substring(0,4).toLowerCase() === 'vdka')
            )
          })

          for (var i2=0; i2 < tiles.length; i2++) {
            try {
              video = tiles[i2].video
              video = convert_raw_video(video, tiles[i2].link)

              if (video)
                videos.push(video)
            }
            catch(e3) {}
          }
        }
        catch(e2) {}
      }

      if (videos.length) {
        if (!user_options.common.sort_newest_first)
          videos.reverse()

        state.videos = videos

        video = videos[0]
        if ((videos.length === 1) && !video.locked)
          process_video(0)
        else
          rewrite_show_page()
      }
    }
    catch(e1) {}
  }
}

init()
wrap_history_state_mutations()

// -----------------------------------------------------------------------------
