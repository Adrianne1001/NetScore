/* =====================================================================
 * NetScore — Scoreboard engine & UI controller
 * Pure vanilla JS. State-driven: mutate `state`, then render().
 * =================================================================== */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = 'netscore.v1';

  /* -------------------------------------------------- state -------- */
  let state = null;      // live match state
  let history = [];      // snapshots for undo
  let clockTimer = null; // setInterval handle
  let sfx = null;        // WebAudio context (lazy)

  /* ----- build a fresh config from a sport, honoring overrides ----- */
  function makeConfig(sportKey, overrides) {
    const base = SPORTS[sportKey] || SPORTS.badminton;
    return Object.assign({}, base, overrides || {});
  }

  function isSideout(cfg) { return cfg.scoring === 'sideout'; }
  function isDoubles(cfg) { return cfg.doubles !== false; }
  // starting server number for a side-out game: doubles begins on "2nd server"
  // (the 0-0-2 rule) so one fault ends the first service turn; singles is always 1
  function startServerNum(cfg) {
    return (isSideout(cfg) && isDoubles(cfg)) ? 2 : 1;
  }

  function freshMatch(sportKey, overrides, names, startServer, sound) {
    const cfg = makeConfig(sportKey, overrides);
    return {
      sportKey,
      cfg,
      names: names || ['Team A', 'Team B'],
      score: [0, 0],
      sets: [0, 0],          // games/sets won
      games: [],             // finished games: {a, b}
      gameIndex: 0,
      server: startServer ?? 0,
      startServer: startServer ?? 0,
      serverNum: startServerNum(cfg), // side-out: 1 = first server, 2 = second server
      swapped: false,        // are sides visually swapped?
      matchOver: false,
      winner: null,
      sound: !!sound,
      startedAt: null,       // ms timestamp of first point
      elapsed: 0             // accumulated seconds (frozen at match end)
    };
  }

  /* ---------------------------------------------- rule helpers ----- */
  // target score for the current game (handles deciding-game override)
  function gameTarget(s) {
    const decidingIndex = s.cfg.bestOf - 1;
    const played = s.sets[0] + s.sets[1];
    const isDecider = played === decidingIndex && s.cfg.bestOf > 1;
    return isDecider ? (s.cfg.finalGamePoints || s.cfg.points) : s.cfg.points;
  }

  function setsToWin(s) {
    return Math.floor(s.cfg.bestOf / 2) + 1;
  }

  // returns 0 or 1 if a team has won the current game, else -1
  function gameWinner(s) {
    const [a, b] = s.score;
    const target = gameTarget(s);
    const winBy = s.cfg.winBy || 1;
    const cap = s.cfg.cap || 0;
    const check = (x, y) => {
      if (cap && x >= cap && x > y) return true;
      return x >= target && x - y >= winBy;
    };
    if (check(a, b)) return 0;
    if (check(b, a)) return 1;
    return -1;
  }

  // recompute who serves, based on the sport's serve model
  function computeServer(s) {
    const model = s.cfg.serveModel;
    if (model === 'alternate2') {
      const [a, b] = s.score;
      const total = a + b;
      const target = gameTarget(s);
      const deuce = a >= target - 1 && b >= target - 1;
      const switches = deuce ? total : Math.floor(total / 2);
      return (s.startServer + switches) % 2;
    }
    // 'winner' and 'manual' are handled at scoring time; keep current
    return s.server;
  }

  /* ------------------------------------------------ persistence --- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, savedAt: true }));
    } catch (e) { /* ignore quota / private mode */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.state ? data.state : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------- snapshots ---- */
  function snapshot() {
    history.push(JSON.stringify({
      score: state.score, sets: state.sets, games: state.games,
      gameIndex: state.gameIndex, server: state.server, serverNum: state.serverNum,
      matchOver: state.matchOver, winner: state.winner
    }));
    if (history.length > 200) history.shift();
  }
  function undo() {
    if (!history.length) { toast('Nothing to undo'); return; }
    const snap = JSON.parse(history.pop());
    Object.assign(state, snap);
    render();
    save();
    beep(300, 0.05);
  }

  /* --------------------------------------------------- scoring ---- */
  function addPoint(team, delta) {
    if (state.matchOver && delta > 0) return;

    // Side-out sports use rally-outcome input: a "+" / tap means "this team
    // won the rally" — the engine decides whether that scores a point or
    // triggers a server change / side-out. "−" stays a manual correction.
    if (isSideout(state.cfg) && delta > 0) { rallyWon(team); return; }

    const next = state.score[team] + delta;
    if (next < 0) return;

    snapshot();

    // start the clock on the very first point
    if (delta > 0 && state.startedAt === null && state.score[0] === 0 && state.score[1] === 0) {
      state.startedAt = Date.now();
      startClock();
    }

    state.score[team] = next;

    if (delta > 0) {
      // rally-winner serve model: scorer serves next
      if (state.cfg.serveModel === 'winner') state.server = team;
      else state.server = computeServer(state);
      beep(team === 0 ? 660 : 520, 0.05);
    } else {
      state.server = computeServer(state);
    }

    // check for game / match completion
    const gw = gameWinner(state);
    if (gw !== -1 && delta > 0) {
      finishGame(gw);
    }

    render();
    save();
  }

  // Side-out scoring: record who won the rally.
  //  • serving team wins  → they score a point, keep serving
  //  • serving team faults → doubles: 1st server → 2nd server; 2nd server → side-out.
  //                          singles: any fault → side-out. Only the server scores.
  function rallyWon(team) {
    snapshot();

    if (state.startedAt === null && state.score[0] === 0 && state.score[1] === 0) {
      state.startedAt = Date.now();
      startClock();
    }

    if (team === state.server) {
      // point for the serving team
      state.score[team] += 1;
      beep(team === 0 ? 660 : 520, 0.05);
      const gw = gameWinner(state);
      if (gw !== -1) { finishGame(gw); render(); save(); return; }
    } else {
      // serving team faulted — the receiving team won the rally (no point)
      if (isDoubles(state.cfg) && state.serverNum === 1) {
        state.serverNum = 2;                 // hand off to the second server
        toast(`Fault — ${state.names[state.server]} 2nd server`);
      } else {
        state.server = state.server ^ 1;     // side-out
        state.serverNum = 1;
        toast(`Side-out — ${state.names[state.server]} to serve`);
      }
      beep(300, 0.04);
    }

    render();
    save();
  }

  function finishGame(winnerTeam) {
    state.games.push({ a: state.score[0], b: state.score[1] });
    state.sets[winnerTeam]++;
    const need = setsToWin(state);

    if (state.sets[winnerTeam] >= need) {
      state.matchOver = true;
      state.winner = winnerTeam;
      stopClock();
      render();
      setTimeout(() => showWin(winnerTeam), 350);
      return;
    }

    // next game
    state.gameIndex++;
    state.score = [0, 0];
    // server for next game alternates to the other side by convention
    state.startServer = (state.startServer + 1) % 2;
    state.server = state.startServer;
    state.serverNum = startServerNum(state.cfg); // reset the side-out serve sequence
    toast(`Game to ${state.names[winnerTeam]} — ${state.sets[0]}–${state.sets[1]}`);
    flashWin(winnerTeam);
  }

  function toggleServer() {
    state.server = (state.server ^ 1);
    render();
    save();
  }

  /* ----------------------------------------------------- clock ---- */
  function startClock() {
    stopClock();
    clockTimer = setInterval(updateClock, 1000);
    updateClock();
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }
  function updateClock() {
    if (state.startedAt && !state.matchOver) {
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    }
    const m = String(Math.floor(state.elapsed / 60)).padStart(2, '0');
    const sec = String(state.elapsed % 60).padStart(2, '0');
    $('#clockText').textContent = `${m}:${sec}`;
  }

  /* ------------------------------------------------------- SFX ---- */
  function ensureAudio() {
    if (!sfx) {
      try { sfx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { sfx = null; }
    }
    return sfx;
  }
  function beep(freq, dur) {
    if (!state || !state.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  /* ---------------------------------------------------- render ---- */
  function displayIndex(team) {
    // team is logical (0 = A, 1 = B). With swap, map to visual side.
    return state.swapped ? (team ^ 1) : team;
  }

  function render() {
    const cfg = state.cfg;
    const sport = SPORTS[state.sportKey];

    // header
    $('#sportLabel').textContent = sport.name;
    document.documentElement.style.setProperty('--accent', sport.accent);

    // sport chips active state
    document.querySelectorAll('.sport-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.sport === state.sportKey);
    });

    // meta bar
    $('#metaGame').textContent = cfg.bestOf > 1 ? `Game ${state.gameIndex + 1}` : 'Single game';
    const tgt = gameTarget(state);
    $('#metaTarget').textContent = `to ${tgt} · win by ${cfg.winBy}` + (cfg.cap ? ` · cap ${cfg.cap}` : '');
    $('#metaBestOf').textContent = cfg.bestOf > 1 ? `Best of ${cfg.bestOf}` : 'One game';

    // Determine which logical team sits on each visual side
    const leftTeam = state.swapped ? 1 : 0;
    const rightTeam = state.swapped ? 0 : 1;

    paintTeam('A', leftTeam);
    paintTeam('B', rightTeam);

    // pickleball-style score call (server score – receiver score – server #)
    const call = $('#metaCall');
    if (isSideout(cfg) && !state.matchOver) {
      const sv = state.server, rc = sv ^ 1;
      const nums = isDoubles(cfg)
        ? `${state.score[sv]} – ${state.score[rc]} – ${state.serverNum}`
        : `${state.score[sv]} – ${state.score[rc]}`;
      call.textContent = `${state.names[sv]} serving · ${nums}`;
      call.hidden = false;
    } else {
      call.hidden = true;
    }

    // match-point / game-point highlight
    updateJeopardy();

    $('#board').classList.toggle('over', state.matchOver);
  }

  function paintTeam(side, team) {
    $('#name' + side).value = state.names[team];
    $('#score' + side).textContent = state.score[team];

    // serve dot
    const dot = $('#serve' + side);
    dot.classList.toggle('on', state.server === team && !state.matchOver);

    // side-out doubles: show which server (1st / 2nd) is up
    const badge = $('#srv' + side);
    if (isSideout(state.cfg) && isDoubles(state.cfg) && state.server === team && !state.matchOver) {
      badge.textContent = state.serverNum === 2 ? '2nd Server' : '1st Server';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }

    // sets pips
    const box = $('#sets' + side);
    box.innerHTML = '';
    const need = setsToWin(state);
    for (let i = 0; i < need; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < state.sets[team] ? ' won' : '');
      box.appendChild(pip);
    }
  }

  // add a subtle "game point / match point" badge on the leading team
  function updateJeopardy() {
    document.querySelectorAll('.team').forEach((el) => el.classList.remove('jeopardy'));
    if (state.matchOver) return;
    const target = gameTarget(state);
    const winBy = state.cfg.winBy;
    const cap = state.cfg.cap || 0;
    [0, 1].forEach((team) => {
      const x = state.score[team], y = state.score[team ^ 1];
      const oneAway =
        (x + 1 >= target && (x + 1) - y >= winBy) ||
        (cap && x + 1 >= cap && x + 1 > y);
      if (oneAway) {
        const side = (state.swapped ? (team ^ 1) : team) === 0 ? 'teamA' : 'teamB';
        const el = document.getElementById(side);
        el.classList.add('jeopardy');
        const atMatchPoint = state.sets[team] === setsToWin(state) - 1;
        el.style.setProperty('--jeopardy-label', `"${atMatchPoint ? 'MATCH POINT' : 'GAME POINT'}"`);
      }
    });
  }

  /* --------------------------------------------- win / effects --- */
  function flashWin(team) {
    const side = (state.swapped ? (team ^ 1) : team) === 0 ? 'teamA' : 'teamB';
    const el = document.getElementById(side);
    el.classList.add('scored-game');
    setTimeout(() => el.classList.remove('scored-game'), 900);
  }

  function showWin(team) {
    $('#winName').textContent = state.names[team];
    $('#winSub').textContent = 'wins the match';
    const summary = state.games.map((g) => `${g.a}–${g.b}`).join('  ·  ');
    $('#winScore').textContent = `Games: ${state.sets[0]}–${state.sets[1]}   (${summary})`;
    openOverlay('#winOverlay');
    if (window.Confetti) {
      Confetti.fire($('#confetti'), [SPORTS[state.sportKey].accent, '#ffffff', '#ffd93d']);
    }
    beep(880, 0.12);
    setTimeout(() => beep(1180, 0.16), 130);
  }

  /* -------------------------------------------------- overlays ---- */
  function openOverlay(sel) {
    const o = $(sel);
    o.hidden = false;
    requestAnimationFrame(() => o.classList.add('show'));
  }
  function closeOverlay(sel) {
    const o = $(sel);
    o.classList.remove('show');
    setTimeout(() => { o.hidden = true; }, 200);
  }

  /* ----------------------------------------------------- toast ---- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 250);
    }, 2200);
  }

  /* ------------------------------------------------ new / reset --- */
  function resetMatch(confirmFirst) {
    if (confirmFirst && (state.score[0] || state.score[1] || state.sets[0] || state.sets[1])) {
      if (!confirm('Reset the whole match? Current score will be cleared.')) return;
    }
    const s = freshMatch(state.sportKey, extractOverrides(state.cfg), state.names.slice(), state.startServer, state.sound);
    history = [];
    stopClock();
    state = s;
    updateClock();
    render();
    save();
    toast('New match ready');
  }

  function extractOverrides(cfg) {
    return {
      points: cfg.points, winBy: cfg.winBy, cap: cfg.cap,
      bestOf: cfg.bestOf, finalGamePoints: cfg.finalGamePoints,
      serveModel: cfg.serveModel, scoring: cfg.scoring, doubles: cfg.doubles
    };
  }

  function swapSides() {
    state.swapped = !state.swapped;
    render();
    save();
    toast(state.swapped ? 'Sides swapped' : 'Sides restored');
  }

  /* =================================================================
   *  UI WIRING
   * =============================================================== */
  function buildSportChips() {
    const nav = $('#sportSwitch');
    nav.innerHTML = '';
    SPORT_ORDER.forEach((key) => {
      const s = SPORTS[key];
      const b = document.createElement('button');
      b.className = 'sport-chip';
      b.dataset.sport = key;
      b.innerHTML = `<span class="chip-emoji">${s.emoji}</span><span>${s.name}</span>`;
      b.title = s.blurb;
      b.addEventListener('click', () => switchSport(key));
      nav.appendChild(b);
    });
  }

  function switchSport(key) {
    // switching sports starts a fresh match under that sport's defaults,
    // keeping the current team names & sound preference
    const names = state ? state.names.slice() : ['Team A', 'Team B'];
    const sound = state ? state.sound : false;
    history = [];
    stopClock();
    state = freshMatch(key, null, names, 0, sound);
    updateClock();
    render();
    save();
    toast(`${SPORTS[key].name} — ${SPORTS[key].blurb}`);
  }

  function buildSetupSports() {
    const grid = $('#setupSports');
    grid.innerHTML = '';
    SPORT_ORDER.forEach((key) => {
      const s = SPORTS[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sport-card';
      b.dataset.sport = key;
      b.innerHTML = `<span class="card-emoji">${s.emoji}</span><span class="card-name">${s.name}</span>`;
      b.addEventListener('click', () => selectSetupSport(key));
      grid.appendChild(b);
    });
  }

  let setupSelection = 'badminton';
  function selectSetupSport(key) {
    setupSelection = key;
    document.querySelectorAll('.sport-card').forEach((c) =>
      c.classList.toggle('active', c.dataset.sport === key));
    // prefill numeric fields from that sport's defaults
    const s = SPORTS[key];
    $('#setPoints').value = s.points;
    $('#setWinBy').value = s.winBy;
    $('#setCap').value = s.cap || 0;
    $('#setBestOf').value = s.bestOf;
    $('#setScoring').value = s.scoring === 'sideout' ? 'sideout' : 'rally';
    $('#setFormat').value = s.doubles === false ? 'singles' : 'doubles';
    updateScoringUI();
  }

  // reflect scoring choice: format only matters for side-out; show a plain-language note
  function updateScoringUI() {
    const sideout = $('#setScoring').value === 'sideout';
    const doubles = $('#setFormat').value === 'doubles';
    $('#formatField').style.opacity = sideout ? '1' : '.45';
    $('#setFormat').disabled = !sideout;
    const note = $('#scoringNote');
    if (sideout && doubles) {
      note.textContent = 'Side-out (doubles): only the serving team scores. Each team gets two servers — 1st, then 2nd — before the serve passes (side-out). The game starts 0-0-2, so the first team gets a single server. Tap a team when they win the rally.';
    } else if (sideout && !doubles) {
      note.textContent = 'Side-out (singles): only the serving team scores. Any fault by the server is an immediate side-out. Tap a team when they win the rally.';
    } else {
      note.textContent = 'Rally scoring: every rally scores a point for the team that won it, whoever served.';
    }
  }

  function openSetup() {
    setupSelection = state.sportKey;
    document.querySelectorAll('.sport-card').forEach((c) =>
      c.classList.toggle('active', c.dataset.sport === state.sportKey));
    $('#setName0').value = state.names[0];
    $('#setName1').value = state.names[1];
    $('#setPoints').value = state.cfg.points;
    $('#setWinBy').value = state.cfg.winBy;
    $('#setCap').value = state.cfg.cap || 0;
    $('#setBestOf').value = state.cfg.bestOf;
    $('#setStartServer').value = state.startServer;
    $('#setScoring').value = isSideout(state.cfg) ? 'sideout' : 'rally';
    $('#setFormat').value = isDoubles(state.cfg) ? 'doubles' : 'singles';
    $('#setSound').checked = state.sound;
    updateScoringUI();
    openOverlay('#setupOverlay');
  }

  function applySetup() {
    const scoring = $('#setScoring').value === 'sideout' ? 'sideout' : 'rally';
    // pick the serve model that matches the scoring choice
    let serveModel = SPORTS[setupSelection].serveModel;
    if (scoring === 'sideout') serveModel = 'sideout';
    else if (serveModel === 'sideout') serveModel = 'winner';

    const overrides = {
      points: clampInt($('#setPoints').value, 1, 99, 21),
      winBy: clampInt($('#setWinBy').value, 1, 5, 2),
      cap: clampInt($('#setCap').value, 0, 99, 0),
      bestOf: parseInt($('#setBestOf').value, 10) || 3,
      finalGamePoints: SPORTS[setupSelection].finalGamePoints,
      serveModel,
      scoring,
      doubles: $('#setFormat').value === 'doubles'
    };
    // for custom / when cap>0 keep finalGamePoints sensible
    if (setupSelection === 'custom') overrides.finalGamePoints = overrides.points;

    const names = [
      ($('#setName0').value || 'Team A').trim().slice(0, 18),
      ($('#setName1').value || 'Team B').trim().slice(0, 18)
    ];
    const startServer = parseInt($('#setStartServer').value, 10) || 0;
    const sound = $('#setSound').checked;

    history = [];
    stopClock();
    state = freshMatch(setupSelection, overrides, names, startServer, sound);
    updateClock();
    render();
    save();
    closeOverlay('#setupOverlay');
    toast('Match configured — good luck!');
  }

  function clampInt(v, min, max, dflt) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = dflt;
    return Math.max(min, Math.min(max, n));
  }

  /* ----------------------------------------------- name editing -- */
  function wireNameInputs() {
    ['A', 'B'].forEach((side) => {
      const input = $('#name' + side);
      input.addEventListener('change', () => {
        const team = side === 'A'
          ? (state.swapped ? 1 : 0)
          : (state.swapped ? 0 : 1);
        state.names[team] = (input.value || (team === 0 ? 'Team A' : 'Team B')).trim().slice(0, 18);
        save();
      });
      // don't let typing a name trigger keyboard shortcuts
      input.addEventListener('keydown', (e) => e.stopPropagation());
    });
  }

  /* --------------------------------------------------- theme ----- */
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('netscore.theme', next); } catch (e) {}
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  /* ------------------------------------------------ keyboard ----- */
  function onKey(e) {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    const map = {
      q: () => addPoint(logical('A'), +1),
      a: () => addPoint(logical('A'), -1),
      p: () => addPoint(logical('B'), +1),
      l: () => addPoint(logical('B'), -1),
      ' ': () => toggleServer(),
      u: () => undo(),
      s: () => swapSides(),
      r: () => resetMatch(true),
      e: () => openSetup(),
      t: () => toggleTheme(),
      f: () => toggleFullscreen(),
      '?': () => openOverlay('#helpOverlay')
    };
    if (map[k]) { e.preventDefault(); map[k](); }
    if (e.key === 'Escape') {
      ['#setupOverlay', '#helpOverlay', '#winOverlay'].forEach((s) => {
        if (!$(s).hidden) closeOverlay(s);
      });
    }
  }

  // translate a visual side ('A' left / 'B' right) to a logical team index
  function logical(side) {
    if (side === 'A') return state.swapped ? 1 : 0;
    return state.swapped ? 0 : 1;
  }

  /* ------------------------------------------------ init/wire ---- */
  function wire() {
    // score hits (big tap targets)
    $('#hitA').addEventListener('click', () => addPoint(logical('A'), +1));
    $('#hitB').addEventListener('click', () => addPoint(logical('B'), +1));
    $('#plusA').addEventListener('click', (e) => { e.stopPropagation(); addPoint(logical('A'), +1); });
    $('#minusA').addEventListener('click', (e) => { e.stopPropagation(); addPoint(logical('A'), -1); });
    $('#plusB').addEventListener('click', (e) => { e.stopPropagation(); addPoint(logical('B'), +1); });
    $('#minusB').addEventListener('click', (e) => { e.stopPropagation(); addPoint(logical('B'), -1); });

    // serve dots
    $('#serveA').addEventListener('click', () => { state.server = logical('A'); render(); save(); });
    $('#serveB').addEventListener('click', () => { state.server = logical('B'); render(); save(); });

    // center controls
    $('#btnUndo').addEventListener('click', undo);
    $('#btnSwap').addEventListener('click', swapSides);
    $('#btnReset').addEventListener('click', () => resetMatch(true));

    // tools
    $('#btnSetup').addEventListener('click', openSetup);
    $('#btnTheme').addEventListener('click', toggleTheme);
    $('#btnFullscreen').addEventListener('click', toggleFullscreen);
    $('#btnHelp').addEventListener('click', () => openOverlay('#helpOverlay'));

    // setup dialog
    $('#closeSetup').addEventListener('click', () => closeOverlay('#setupOverlay'));
    $('#cancelSetup').addEventListener('click', () => closeOverlay('#setupOverlay'));
    $('#applySetup').addEventListener('click', applySetup);
    $('#setScoring').addEventListener('change', updateScoringUI);
    $('#setFormat').addEventListener('change', updateScoringUI);

    // help dialog
    $('#closeHelp').addEventListener('click', () => closeOverlay('#helpOverlay'));

    // win overlay
    $('#winClose').addEventListener('click', () => closeOverlay('#winOverlay'));
    $('#winNew').addEventListener('click', () => { closeOverlay('#winOverlay'); resetMatch(false); });

    // click backdrop to close dialogs (not the win overlay by accident)
    ['#setupOverlay', '#helpOverlay'].forEach((sel) => {
      $(sel).addEventListener('click', (e) => { if (e.target === $(sel)) closeOverlay(sel); });
    });

    wireNameInputs();
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', save);
  }

  function init() {
    // theme from storage
    try {
      const t = localStorage.getItem('netscore.theme');
      if (t) document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}

    buildSportChips();
    buildSetupSports();

    // resume saved match or start default
    const saved = load();
    state = saved || freshMatch('badminton', null, ['Team A', 'Team B'], 0, false);
    if (state.serverNum == null) state.serverNum = startServerNum(state.cfg);

    // resume clock if a match was in progress
    if (state.startedAt && !state.matchOver) {
      state.startedAt = Date.now() - state.elapsed * 1000;
      startClock();
    }

    wire();
    updateClock();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
