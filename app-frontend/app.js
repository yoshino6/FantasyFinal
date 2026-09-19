(function () {
  'use strict';

  var API_KEY = 'ff_api';
  var TOKEN_KEY = 'ff_token';
  var NAME_KEY = 'ff_name';

  function getApiBase() {
    var saved = localStorage.getItem(API_KEY);
    return (saved || 'http://127.0.0.1:17117').replace(/\/+$/, '');
  }
  var API_BASE = getApiBase();

  var pet = document.getElementById('pet');
  var bubble = document.getElementById('bubble');
  var quickBar = document.getElementById('quickBar');
  var conn = document.getElementById('conn');
  var connText = document.getElementById('connText');
  var welcome = document.getElementById('welcome');
  var chatOverlay = document.getElementById('chatOverlay');
  var commandInput = document.getElementById('commandInput');
  var petStateTimer = null;
  var lastPetState = 'idle';

  /* 梨子喵状态机：单张立绘通过 CSS 过渡表现待机、走路和休息动作。 */
  var PET_STATE_DURATION = {
    idle: 4600,
    walk: 3800,
    blink: 700,
    stretch: 1800,
    yawn: 1800,
    sit: 3600,
    sleep: 8000
  };

  function setPetState(state) {
    if (!pet) return;
    var next = PET_STATE_DURATION[state] ? state : 'idle';
    lastPetState = next;
    pet.dataset.state = next;
  }

  function choosePetState() {
    var roll = Math.random();
    var next;
    if (roll < 0.42) next = 'idle';
    else if (roll < 0.62) next = 'walk';
    else if (roll < 0.72) next = 'blink';
    else if (roll < 0.81) next = 'stretch';
    else if (roll < 0.89) next = 'yawn';
    else if (roll < 0.97) next = 'sit';
    else next = 'sleep';
    return next === lastPetState ? 'idle' : next;
  }

  function queuePetState(state, duration) {
    clearTimeout(petStateTimer);
    setPetState(state);
    petStateTimer = setTimeout(function () {
      if (document.hidden) {
        queuePetState('sleep', PET_STATE_DURATION.sleep);
      } else {
        var next = choosePetState();
        queuePetState(next, PET_STATE_DURATION[next]);
      }
    }, duration || PET_STATE_DURATION[state] || PET_STATE_DURATION.idle);
  }

  function playPetState(state, duration) {
    queuePetState(state, duration || PET_STATE_DURATION[state]);
  }

  function startPetStateMachine() {
    queuePetState('idle', PET_STATE_DURATION.idle);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      playPetState('sleep', PET_STATE_DURATION.sleep);
    } else {
      playPetState('idle', PET_STATE_DURATION.idle);
    }
  });

  function setConn(online) {
    conn.classList.toggle('online', online);
    connText.textContent = online ? '世界已连接' : '后端未连接';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showBubble(html) {
    bubble.innerHTML = html;
    bubble.style.display = 'block';
    bubble.scrollTop = 0;
  }

  function say(text, petReply) {
    var parts = '';
    if (petReply) {
      parts += '<span class="pet-say">' + escapeHtml(petReply) + '</span>';
    }
    if (text) {
      parts += escapeHtml(text);
    }
    showBubble(parts || '<span class="title">小梦</span> 在发呆…');
  }

  function petJump() {
    pet.classList.remove('jump');
    void pet.offsetWidth;
    pet.classList.add('jump');
  }

  function api(path, opts) {
    var options = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var init = { method: options.method || 'GET', headers: headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(API_BASE + path, init).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || '请求失败（' + res.status + '）');
        return data;
      });
    });
  }

  function svgIcon(name) {
    var paths = {
      person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
      bag: '<path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      heart: '<path d="M12 21C7 16.5 3 13 3 8.8 3 6 5.2 4 7.8 4c1.8 0 3.4 1 4.2 2.5C12.8 5 14.4 4 16.2 4 18.8 4 21 6 21 8.8 21 13 17 16.5 12 21z"/>',
      map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
      shield: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/>',
      bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
      team: '<circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="10" r="2.5"/><path d="M15 20c0-2.8 1.8-4.8 4.5-4.8S22 17.2 22 20"/>',
      spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.spark) + '</svg>';
  }

  function defaultButtons() {
    return [
      { label: '角色', command: '/角色' },
      { label: '背包', command: '/背包' },
      { label: '状态', command: '/状态' },
      { label: '探索', command: '/探索' },
      { label: '装备', command: '/装备' },
      { label: '技能', command: '/技能' },
      { label: '邮件', command: '/邮件' },
      { label: '队伍', command: '/队伍' }
    ];
  }

  function renderButtons(buttons) {
    quickBar.innerHTML = '';
    var list = Array.isArray(buttons) && buttons.length ? buttons : defaultButtons();
    var icons = { '角色': 'person', '背包': 'bag', '状态': 'heart', '探索': 'map', '装备': 'shield', '技能': 'bolt', '邮件': 'mail', '队伍': 'team', '注册': 'spark' };
    list.forEach(function (b) {
      var btn = document.createElement('button');
      var cmd = String(b.command || '').replace(/^\//, '');
      var key = cmd.split(' ')[0] || '';
      btn.innerHTML = svgIcon(icons[key] || 'spark') + '<span>' + escapeHtml(b.label || b.command || '') + '</span>';
      btn.addEventListener('click', function () { runCommand(b.command); });
      quickBar.appendChild(btn);
    });
  }

  function runCommand(command) {
    closeChat();
    petJump();
    api('/app-api/v1/command', { method: 'POST', body: { command: command } })
      .then(function (data) {
        renderButtons(data.buttons);
        say(data.text, data.petReply);
      })
      .catch(function (err) {
        say('出错了：' + err.message);
      });
  }

  function loadPanel() {
    api('/app-api/v1/panel')
      .then(function (data) {
        renderButtons(data.buttons);
        say(data.text, data.petReply);
      })
      .catch(function (err) {
        if (String(err.message).indexOf('登录') >= 0 || String(err.message).indexOf('失效') >= 0) {
          localStorage.removeItem(TOKEN_KEY);
          welcome.classList.remove('hide');
        } else {
          say('出错了：' + err.message);
        }
      });
  }

  function openChat() {
    playPetState('blink', PET_STATE_DURATION.blink);
    commandInput.value = '';
    chatOverlay.style.display = 'flex';
    setTimeout(function () { commandInput.focus(); }, 250);
  }

  function closeChat() {
    chatOverlay.style.display = 'none';
  }

  function sendChat() {
    var cmd = commandInput.value.trim();
    if (!cmd) return;
    if (cmd.indexOf('/') !== 0) cmd = '/' + cmd;
    runCommand(cmd);
  }

  pet.addEventListener('click', openChat);
  document.getElementById('sendBtn').addEventListener('click', sendChat);
  commandInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  chatOverlay.addEventListener('click', function (e) {
    if (e.target === chatOverlay) closeChat();
  });

  /* 欢迎 / 注册 / 绑定 */
  var tabNew = document.getElementById('tabNew');
  var tabBind = document.getElementById('tabBind');
  var bindField = document.getElementById('bindField');
  var wName = document.getElementById('wName');
  var wCode = document.getElementById('wCode');
  var wErr = document.getElementById('wErr');
  var wGo = document.getElementById('wGo');
  var bindMode = false;

  function setTab(bind) {
    bindMode = bind;
    tabNew.classList.toggle('active', !bind);
    tabBind.classList.toggle('active', bind);
    bindField.style.display = bind ? 'block' : 'none';
    wErr.textContent = '';
  }
  tabNew.addEventListener('click', function () { setTab(false); });
  tabBind.addEventListener('click', function () { setTab(true); });

  wGo.addEventListener('click', function () {
    var name = wName.value.trim();
    if (!name) { wErr.textContent = '请先填写昵称。'; return; }
    if (bindMode && !/^\d{6}$/.test(wCode.value.trim())) { wErr.textContent = '绑定码需要 6 位数字。'; return; }
    wGo.disabled = true;
    wErr.textContent = '';
    api('/app-api/v1/register', { method: 'POST', body: { displayName: name } })
      .then(function (registered) {
        localStorage.setItem(TOKEN_KEY, registered.accessToken);
        localStorage.setItem(NAME_KEY, name);
        if (bindMode) {
          return api('/app-api/v1/bind', { method: 'POST', body: { code: wCode.value.trim() } })
            .then(function (bound) {
              localStorage.setItem('ff_qq', bound.qqUserId || '');
            });
        }
      })
      .then(function () {
        welcome.classList.add('hide');
        playPetState('blink', PET_STATE_DURATION.blink);
        loadPanel();
      })
      .catch(function (err) { wErr.textContent = err.message; })
      .then(function () { wGo.disabled = false; });
  });

  /* 设置 */
  var modal = document.getElementById('settingsModal');
  var apiInput = document.getElementById('apiInput');
  document.getElementById('openSettings').addEventListener('click', function () {
    apiInput.value = API_BASE;
    modal.classList.add('show');
  });
  document.getElementById('cancelSettings').addEventListener('click', function () { modal.classList.remove('show'); });
  document.getElementById('saveSettings').addEventListener('click', function () {
    var val = (apiInput.value.trim() || 'http://127.0.0.1:17117').replace(/\/+$/, '');
    localStorage.setItem(API_KEY, val);
    API_BASE = val;
    modal.classList.remove('show');
    loadPanel();
  });

  /* 星星 */
  (function makeStars() {
    var wrap = document.getElementById('stars');
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 70; i++) {
      var s = document.createElement('div');
      s.className = 'star' + (i % 5 === 0 ? ' big' : '');
      s.style.left = (Math.random() * 100) + '%';
      s.style.top = (Math.random() * 62) + '%';
      s.style.animationDelay = (Math.random() * 3) + 's';
      s.style.animationDuration = (2.6 + Math.random() * 2.4) + 's';
      frag.appendChild(s);
    }
    wrap.appendChild(frag);
  })();

  function checkHealth() {
    api('/app-api/v1/health').then(function () { setConn(true); }).catch(function () { setConn(false); });
  }
  checkHealth();
  setInterval(checkHealth, 10000);

  if (localStorage.getItem(TOKEN_KEY)) {
    welcome.classList.add('hide');
    playPetState('blink', PET_STATE_DURATION.blink);
    loadPanel();
  }

  startPetStateMachine();
})();
