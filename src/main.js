import * as THREE from 'three';
import './style.css';
import { LEVELS, levelForRadius } from './rules.js';
import { createMap, MAPS, DEFAULT_MAP } from './maps/index.js';
import { MapScene } from './render/map-scene.js';
import { fallPose } from './fall.js';
import { availableItemNames } from './items/catalog.js';
import { predictPosition } from './render/motion.js';
import { Match, ROUND_SECONDS, modeName, standings } from './match.js';
import { Room, validRoomCode } from './room.js';
import { createMapPicker } from './ui/map-picker.js';

const $ = selector => document.querySelector(selector);
const icons = {
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
$('#sound').innerHTML = icon('muted');
$('#pause').innerHTML = icon('pause');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('#loading').innerHTML = '<p>当前浏览器的 3D 渲染暂不可用，请开启硬件加速后刷新。</p>';
  throw new Error('WebGL initialization failed');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.localClippingEnabled = true;
$('#world').append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e4edf0');
scene.fog = new THREE.Fog('#e4edf0', 65, 125);
const camera = new THREE.OrthographicCamera(-30, 30, 22, -22, .1, 180);
const cameraTarget = new THREE.Vector3(0, 0, 0);
const cameraOffset = new THREE.Vector3(32, 44, 38);
const ambient = new THREE.HemisphereLight('#fff8ed', '#8da7a7', 2.8); scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff3dd', 3.2);
sun.position.set(-22, 45, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 43, bottom: -43, near: 1, far: 100 });
sun.shadow.bias = -.001;
sun.shadow.normalBias = .04;
sun.shadow.radius = 3;
scene.add(sun);

const sphereGeometry = new THREE.IcosahedronGeometry(1, 0);
let map, mapScene;
const hole = new THREE.Group(); scene.add(hole);
const holeDisk = new THREE.Mesh(new THREE.CircleGeometry(1, 80), new THREE.MeshBasicMaterial({ color: '#171520' }));
holeDisk.rotation.x = -Math.PI / 2; holeDisk.position.y = .092; hole.add(holeDisk);
const innerDisk = new THREE.Mesh(new THREE.CircleGeometry(.83, 80), new THREE.MeshBasicMaterial({ color: '#0d0c13' }));
innerDisk.rotation.x = -Math.PI / 2; innerDisk.position.y = .095; hole.add(innerDisk);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .048, 8, 80), new THREE.MeshStandardMaterial({ color: '#a68add', roughness: .85 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = .11; hole.add(ring);
const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.1, 80), new THREE.MeshBasicMaterial({ color: '#c2b0e4', transparent: true, opacity: .55, side: THREE.DoubleSide }));
outerRing.rotation.x = -Math.PI / 2; outerRing.position.y = .08; hole.add(outerRing);

let particles = [], randomSeed = 24681, selectedMapId = DEFAULT_MAP;
let snapshotAt = 0, hudKey = '', activeClaims = [], hiddenItems = new Set();
let view, game, room = null, selfId = 'local', selectedMode = 'free', roomMode = 'race';
let lastTime = 0, comboCount = 0, toastUntil = 0, comboUntil = 0, lastFoodTime = -10;
let busy = false, shownResultRound = null, lastPersonalEaten = 0, previousLevel = 0;
const remoteHoles = new Map();
let soundOn = false, audioContext;
let pointer = null;
const keys = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function random() { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; }
function rebuildMap(seed, mapId) {
  mapScene?.dispose(); map = createMap(mapId, seed); randomSeed = seed;
  mapScene = new MapScene(scene, map);
  $('.progress-meta > span').textContent = `${map.name}清空进度`;
  hiddenItems = new Set(); activeClaims = [];
  scene.background.set(map.sky); scene.fog.color.set(map.sky); cameraOffset.fromArray(map.cameraOffset);
  scene.fog.near = map.fog?.[0] ?? 78; scene.fog.far = map.fog?.[1] ?? 160;
  const lighting = map.lighting || {};
  ambient.color.set(lighting.skyLight || '#fff8ed'); ambient.groundColor.set(lighting.groundLight || '#8da7a7'); ambient.intensity = lighting.ambientIntensity ?? 2.8;
  sun.color.set(lighting.sunColor || '#fff3dd'); sun.intensity = lighting.sunIntensity ?? 3.2;
  renderer.toneMappingExposure = lighting.exposure ?? 1.25;
  sun.position.set(-map.bounds * .55, map.bounds * 1.5, map.bounds * .45);
  const extent = map.bounds * 1.5;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: map.bounds * 4 }); sun.shadow.camera.updateProjectionMatrix();
  $('#app').dataset.theme = map.theme || 'light';
  $('#world').setAttribute('aria-label', `3D ${map.name}游戏场景`);
  renderer.shadowMap.needsUpdate = true;
  for (const visual of remoteHoles.values()) { scene.remove(visual); visual.children[2].material.dispose(); visual.children[3].material.dispose(); }
  remoteHoles.clear();
  for (const p of particles) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  particles = [];
}
function me() { return view?.players.find(player => player.id === selfId) || view?.players[0]; }
function playerList(target, players, lobby = false) {
  const fragment = document.createDocumentFragment();
  players.forEach((player, index) => {
    const row = document.createElement('li'); if (player.id === selfId) row.classList.add('self');
    const rank = document.createElement('span'); rank.className = 'rank-number'; rank.textContent = lobby ? '' : index + 1;
    const dot = document.createElement('span'); dot.className = 'player-dot'; dot.style.background = player.color;
    const name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name + (player.id === selfId ? '（你）' : '');
    const stat = document.createElement('span'); stat.className = 'player-stat';
    stat.textContent = !player.online ? '已离开' : lobby ? (player.ready ? '已准备' : '等待准备') : `${player.mass * 10} 分`;
    row.append(rank, dot, name, stat); fragment.append(row);
  });
  target.replaceChildren(fragment);
}
function acceptSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.claims)) return;
  if (room) selfId = room.selfId;
  const newRound = view?.round !== snapshot.round || view?.mapId !== snapshot.mapId || view?.seed !== snapshot.seed;
  const oldPhase = view?.phase;
  view = snapshot; snapshotAt = performance.now();
  if (newRound) {
    rebuildMap(view.seed, view.mapId); comboCount = 0; lastFoodTime = -10; lastPersonalEaten = 0; previousLevel = 0;
    $('#combo').classList.remove('visible');
    const player = me(); if (player) { hole.position.set(player.x, 0, player.z); hole.scale.setScalar(player.radius); cameraTarget.set(player.x - 7, 0, player.z); }
  }
  const player = me();
  if (player && player.eaten > lastPersonalEaten) {
    comboCount = view.elapsed - lastFoodTime < 2.4 ? comboCount + player.eaten - lastPersonalEaten : player.eaten - lastPersonalEaten;
    lastFoodTime = view.elapsed;
    if (comboCount >= 3) { $('#combo').textContent = `连吃 × ${comboCount}`; $('#combo').classList.add('visible'); comboUntil = performance.now() + 1400; }
    const level = levelForRadius(player.radius);
    if (level > previousLevel) toast(`胃口升级！现在可以吃${availableItemNames(map.items, player.radius)}`);
    playSound(level > previousLevel); previousLevel = level;
    if (!reducedMotion) for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: i % 2 ? '#b69ada' : '#f1d189', transparent: true }));
      p.position.set(player.x + (random() - .5) * player.radius, .3, player.z + (random() - .5) * player.radius); p.scale.setScalar(.12);
      scene.add(p); particles.push({ mesh: p, life: .7, vx: (random() - .5) * 2, vz: (random() - .5) * 2 });
    }
  }
  lastPersonalEaten = player?.eaten || 0;
  const inPlay = view.phase !== 'lobby';
  $('.bottom-bar').hidden = !inPlay;
  $('#pause').hidden = !inPlay;
  $('#paused-banner').hidden = view.phase !== 'paused' || !room;
  if (view.phase === 'paused') $('#paused-banner').textContent = room?.isHost ? '整局已暂停。' : '房主已暂停游戏，等待继续。';
  activeClaims = view.claims.filter(claim => !claim.done);
  let changed = false;
  for (const claim of view.claims) if (claim.done && !hiddenItems.has(claim.id)) { mapScene.hide(map.items[claim.id]); hiddenItems.add(claim.id); changed = true; }
  if (changed) { mapScene.flush(); renderer.shadowMap.needsUpdate = true; }
  $('#app').classList.toggle('playing', inPlay || Boolean(room));
  $('#intro').inert = inPlay || Boolean(room);
  $('#pause').disabled = view.phase !== 'playing';
  $('#pause').setAttribute('aria-label', room && !room.isHost ? '打开菜单' : '暂停游戏');
  $('#pause').title = room && !room.isHost ? '打开菜单' : '暂停游戏';
  $('#home').hidden = !inPlay && !room;
  $('#mode-label').textContent = modeName(view.mode);
  $('#room-panel').hidden = !room || view.phase !== 'lobby';
  $('#leaderboard').hidden = !room || !inPlay;
  $('#restart span').textContent = room ? '离开房间' : '重新开始';
  $('#restart').title = room ? '离开房间' : `重新生成${map.name}`;
  if (room && view.phase === 'lobby') {
    $('#invite-code').textContent = room.code;
    $('#room-description').textContent = view.mode === 'race' ? '120 秒竞赛' : '合作清空';
    roomMapPicker.setValue(view.mapId);
    roomMapPicker.setDisabled(!room.isHost);
    $('#room-map-picker').hidden = !room.isHost;
    $('#room-map-name').hidden = room.isHost;
    const mapName = mapChoices.find(choice => choice.id === view.mapId)?.label || map.name;
    if ($('#room-map-name').textContent !== mapName) $('#room-map-name').textContent = mapName;
    playerList($('#lobby-players'), view.players, true);
    if (room.isHost) {
      const ready = view.players.length >= 2 && view.players.every(p => p.ready);
      $('#room-start').disabled = !ready;
      $('#room-start').textContent = ready ? '开始游戏' : view.players.length < 2 ? '等待朋友加入' : '等待大家准备';
    } else {
      $('#room-start').disabled = false; $('#room-start').textContent = player?.ready ? '取消准备' : '准备好了';
    }
  }
  const rankingKey = room ? JSON.stringify(view.players.map(p => [p.id, p.mass, p.eaten, p.online])) : '';
  if (room && rankingKey !== hudKey) playerList($('#ranking-list'), standings(view.players));
  hudKey = rankingKey;
  if (oldPhase === 'lobby' && view.phase === 'playing') { clearPointer(); keys.clear(); toast(room ? '游戏已开始' : '按住拖动或使用 WASD / 方向键移动'); }
  updateHUD();
  if (view.phase === 'finished' && shownResultRound !== view.round) {
    shownResultRound = view.round; clearPointer(); keys.clear();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    $('#result-title').textContent = view.eaten === view.total ? '地图已清空' : '时间结束';
    $('#win-description').textContent = room ? `共吞噬 ${view.eaten} / ${view.total} 件物体，以下为${view.mode === 'coop' ? '个人贡献' : '本轮排名'}。` : `已吞噬 ${player.eaten} 件物体，获得 ${player.mass * 10} 分，洞口直径 ${(player.radius * 2).toFixed(1)} 米。`;
    playerList($('#result-ranking'), standings(view.players));
    $('#play-again').textContent = room ? room.isHost ? '再来一局' : '等待房主再开一局' : '再来一局';
    $('#play-again').disabled = Boolean(room && !room.isHost);
    $('#win-dialog').showModal();
  }
  if (newRound && $('#win-dialog').open) $('#win-dialog').close();
}
function updateHUD() {
  const player = me(); if (!player) return;
  const level = levelForRadius(player.radius);
  $('#level-number').textContent = level + 1; $('#level-name').textContent = LEVELS[level].name;
  $('#edible-label').textContent = `可以吞噬：${availableItemNames(map.items, player.radius) || '寻找更小的物体'}`;
  $('#size').innerHTML = `${(player.radius * 2).toFixed(1)}<span> m</span>`;
  $('#eaten').textContent = view.eaten; $('#total').textContent = view.total;
  $('#progress-fill').style.transform = `scaleX(${view.eaten / view.total})`;
  const timed = view.mode === 'timed' || view.mode === 'race';
  $('#clock').hidden = !timed || view.phase === 'lobby';
  const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - view.elapsed));
  $('#clock strong').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('#clock').classList.toggle('urgent', remaining <= 20);
}
function toast(message) { $('#toast-status').textContent = message; $('#toast').textContent = message; $('#toast').classList.add('visible'); toastUntil = performance.now() + 3200; }
function playSound(levelUp = false) {
  if (!soundOn) return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); void audioContext.resume();
  const osc = audioContext.createOscillator(), gain = audioContext.createGain(), time = audioContext.currentTime;
  osc.type = 'sine'; osc.frequency.setValueAtTime(levelUp ? 440 : 150 + Math.min(comboCount, 16) * 24, time);
  osc.frequency.exponentialRampToValueAtTime(levelUp ? 880 : 75, time + .18);
  gain.gain.setValueAtTime(.09, time); gain.gain.exponentialRampToValueAtTime(.001, time + .24);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(time + .25);
}
function clearPointer() { pointer = null; $('#joystick').style.display = 'none'; $('#joystick span').style.transform = ''; }
function stopInput() { keys.clear(); clearPointer(); }
function singleGame(mode, started = false) {
  selfId = 'local'; stopInput();
  game = new Match(mode, undefined, selectedMapId); game.addPlayer(selfId, $('#nickname').value || '我');
  if (started) game.start(); acceptSnapshot(game.snapshot());
}
function selectMode(mode) {
  selectedMode = mode;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  $('#network-form').hidden = mode !== 'online'; $('#start').hidden = mode === 'online';
  if (!room) singleGame(mode === 'online' ? 'free' : mode);
}
function showHome() {
  room?.close(); room = null; busy = false;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
  $('#invite-link').hidden = true; $('#create-room').disabled = $('#join-room').disabled = false;
  selectMode(selectedMode); $('#network-status').textContent = '';
}
function networkFailure(message) {
  const wasPlaying = room && ['playing', 'paused'].includes(view.phase);
  room?.close(); room = null; busy = false;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('#create-room').disabled = $('#join-room').disabled = false;
  singleGame('free'); selectMode('online');
  $('#network-status').textContent = message;
  if (wasPlaying) { $('#disconnect-message').textContent = message; $('#disconnect-dialog').showModal(); }
}
async function connectRoom(host) {
  if (busy) return;
  const code = $('#room-code').value.trim().toUpperCase();
  if (!host && !validRoomCode(code)) { $('#network-status').textContent = '请输入正确的 8 位房间号。'; return; }
  busy = true; $('#create-room').disabled = $('#join-room').disabled = true;
  $('#network-status').textContent = host ? '正在创建好友房…' : '正在连接房主…';
  const connection = new Room({ onSnapshot: acceptSnapshot, onError: networkFailure, beforeInput: simulationStep, onStatus: message => { $('#network-status').textContent = message; } });
  room = connection;
  try {
    if (host) await connection.create($('#nickname').value, roomMode, selectedMapId);
    else await connection.join(code, $('#nickname').value);
    if (room !== connection || connection.closed) return;
    busy = false; $('#create-room').disabled = $('#join-room').disabled = false;
    const url = new URL(location.href); url.searchParams.set('room', connection.code); history.replaceState(null, '', url);
  } catch (error) { if (room === connection) networkFailure(error.message || '连接失败，请稍后重试。'); }
}
function setSessionPaused(paused) {
  const owner = room ? room.isHost ? room.game : null : game;
  if (!owner || (paused ? owner.phase !== 'playing' : owner.phase !== 'paused')) return;
  if (paused) simulationStep();
  simulationTime = performance.now();
  owner.setPaused(selfId, paused);
  if (room) room.publish(); else acceptSnapshot(owner.snapshot());
}
function pauseGame() {
  if (view.phase !== 'playing' || document.querySelector('dialog[open]')) return;
  stopInput(); setSessionPaused(true);
  $('#pause-dialog h2').textContent = room && !room.isHost ? '游戏菜单' : '游戏已暂停';
  $('#pause-dialog p').textContent = room?.isHost ? '所有玩家和倒计时均已暂停。' : room ? '其他玩家继续游戏。' : '移动和计时已暂停。';
  $('#pause-dialog').showModal();
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (view.phase !== 'playing' || document.querySelector('dialog[open]') || event.button !== 0) return;
  renderer.domElement.setPointerCapture(event.pointerId);
  pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
  if (event.pointerType === 'touch') { $('#joystick').style.display = 'block'; $('#joystick').style.left = `${event.clientX}px`; $('#joystick').style.top = `${event.clientY}px`; }
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  pointer.x = event.clientX; pointer.y = event.clientY;
  const dx = pointer.x - pointer.startX, dy = pointer.y - pointer.startY, scale = Math.min(1, 28 / (Math.hypot(dx, dy) || 1));
  $('#joystick span').style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(event, clearPointer);
const movementKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => selectMode(button.dataset.mode));
for (const button of document.querySelectorAll('[data-room-mode]')) button.addEventListener('click', () => {
  roomMode = button.dataset.roomMode;
  for (const choice of document.querySelectorAll('[data-room-mode]')) choice.setAttribute('aria-pressed', String(choice === button));
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, dialog')) return;
  if (event.key === 'Escape' || event.key === ' ') { if (event.target.closest('button, a')) return; event.preventDefault(); pauseGame(); return; }
  if (view.phase !== 'playing') return;
  if (movementKeys.includes(event.key.toLowerCase())) { event.preventDefault(); keys.add(event.key.toLowerCase()); }
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { stopInput(); if (!room) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopInput(); if (!room) pauseGame(); } });
$('#start').addEventListener('click', () => {
  // Start the previewed layout so its displayed object count remains accurate.
  if (!room && game?.phase === 'lobby' && game.mapId === selectedMapId && game.mode === selectedMode) {
    game.start(); acceptSnapshot(game.snapshot());
  }
  $('#start').blur();
});
$('#pause').addEventListener('click', pauseGame);
$('#pause-dialog').addEventListener('close', () => { setSessionPaused(false); $('#pause').blur(); });
$('#sound').addEventListener('click', () => { soundOn = !soundOn; $('#sound').innerHTML = icon(soundOn ? 'sound' : 'muted'); $('#sound').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效'); $('#sound').title = soundOn ? '关闭音效' : '开启音效'; $('#sound').blur(); if (soundOn) playSound(); });
function confirmExit() {
  if (view.phase === 'lobby' && !room) { singleGame(selectedMode === 'online' ? 'free' : selectedMode); return; }
  stopInput(); if (!room) setSessionPaused(true);
  $('#restart-dialog h2').textContent = room ? '离开房间？' : '重新开始？';
  $('#restart-dialog p').textContent = room ? room.isHost ? '房主离开后，所有人的房间都会结束。' : '离开后可以重新加入下一轮。' : '重新开始将重置本轮进度。';
  $('#confirm-restart').textContent = room ? '离开房间' : '重新开始';
  $('#restart-dialog').showModal();
}
$('#restart').addEventListener('click', confirmExit);
$('#home').addEventListener('click', () => {
  if (room) { confirmExit(); return; }
  showHome();
});
$('#cancel-restart').addEventListener('click', () => $('#restart-dialog').close());
$('#restart-dialog').addEventListener('close', () => { if (!room) setSessionPaused(false); $('#restart').blur(); });
$('#confirm-restart').addEventListener('click', () => { $('#restart-dialog').close(); if (room) showHome(); else { singleGame(selectedMode, true); toast('已重新开始'); } });
$('#play-again').addEventListener('click', () => { $('#win-dialog').close(); if (room?.isHost) room.rematch(); else singleGame(selectedMode, true); });
$('#stay').addEventListener('click', showHome);
$('#disconnect-home').addEventListener('click', showHome);
$('#disconnect-dialog').addEventListener('cancel', () => showHome());
$('#win-dialog').addEventListener('cancel', () => { if (view.phase === 'finished') showHome(); });
$('#create-room').addEventListener('click', () => connectRoom(true));
$('#join-room').addEventListener('click', () => connectRoom(false));
$('#room-code').addEventListener('input', () => { $('#room-code').value = $('#room-code').value.toUpperCase(); });
$('#leave-lobby').addEventListener('click', confirmExit);
$('#room-start').addEventListener('click', () => {
  if (!room) return;
  if (room.isHost) { room.game.start(); room.publish(); }
  else room.ready(!me().ready);
  $('#room-start').blur();
});
$('#copy-invite').addEventListener('click', async () => {
  const url = new URL(location.href); url.searchParams.set('room', room.code);
  try { await navigator.clipboard.writeText(url.href); toast('邀请链接已复制，发给朋友就能加入'); }
  catch { $('#invite-link').hidden = false; $('#invite-link').value = url.href; $('#invite-link').select(); }
});
window.addEventListener('beforeunload', () => room?.close());
const screenRight = new THREE.Vector3(), screenForward = new THREE.Vector3();
function readInput() {
  if (view.phase !== 'playing' || document.querySelector('dialog[open]')) return { x: 0, z: 0 };
  let dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (pointer) { dx = (pointer.x - pointer.startX) / 45; dy = (pointer.y - pointer.startY) / 45; }
  const length = Math.hypot(dx, dy); if (length < .06) return { x: 0, z: 0 };
  const divisor = Math.max(1, length); dx /= divisor; dy /= divisor;
  screenRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  screenForward.crossVectors(new THREE.Vector3(0, 1, 0), screenRight).normalize();
  return { x: screenRight.x * dx - screenForward.x * dy, z: screenRight.z * dx - screenForward.z * dy };
}
let simulationTime = performance.now(), publishTime = 0;
function simulationStep() {
  const now = performance.now(), dt = (now - simulationTime) / 1000; simulationTime = now;
  const owner = room ? room.isHost ? room.game : null : game;
  const input = readInput();
  if (owner) owner.advance(dt);
  if (room) room.input(input); else owner?.setInput(selfId, input);
  if (owner && now - publishTime >= 90 && owner.phase === 'playing') {
    publishTime = now;
    if (room) room.publish(); else acceptSnapshot(owner.snapshot());
  } else if (owner?.phase === 'finished' && view.phase !== 'finished') {
    if (room) room.publish(); else acceptSnapshot(owner.snapshot());
  }
}
setInterval(simulationStep, 50);
function resize() { renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); }
window.addEventListener('resize', resize);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, .04); lastTime = now;
  const player = me(); if (!player) return;
  const blend = 1 - Math.exp(-dt * 20);
  const animationAge = view.phase === 'playing' ? Math.min((now - snapshotAt) / 1000, .15) : 0;
  const position = predictPosition(player, animationAge, map.bounds);
  hole.position.lerp(new THREE.Vector3(position.x, 0, position.z), blend);
  hole.scale.setScalar(THREE.MathUtils.lerp(hole.scale.x, player.radius, blend)); ring.material.color.set(player.color);
  for (const other of view.players) {
    if (other.id === selfId || !other.online) continue;
    if (!remoteHoles.has(other.id)) {
      const visual = hole.clone(true); visual.children[2].material = ring.material.clone(); visual.children[3].material = outerRing.material.clone();
      visual.children[2].material.color.set(other.color); visual.position.set(other.x, 0, other.z); scene.add(visual); remoteHoles.set(other.id, visual);
    }
    const visual = remoteHoles.get(other.id); visual.visible = true;
    const position = predictPosition(other, animationAge, map.bounds);
    visual.position.lerp(new THREE.Vector3(position.x, 0, position.z), blend);
    visual.scale.setScalar(THREE.MathUtils.lerp(visual.scale.x, other.radius, blend));
  }
  for (const [id, visual] of remoteHoles) visual.visible = view.players.some(p => p.id === id && p.online);
  const animationTime = view.elapsed + animationAge;
  for (const claim of activeClaims) {
    const item = map.items[claim.id], owner = view.players.find(p => p.id === claim.owner);
    if (!owner) continue;
    const visual = owner.id === selfId ? hole : remoteHoles.get(owner.id);
    mapScene.pose(item, fallPose(item, claim, animationTime, visual?.position || owner, reducedMotion));
  }
  if (activeClaims.length) { mapScene.flush(); renderer.shadowMap.needsUpdate = true; }
  if (view.phase !== 'paused') for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.mesh.position.y += dt * 2; p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt; p.mesh.material.opacity = Math.max(0, p.life / .7);
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i, 1); }
  }
  if (now > toastUntil) $('#toast').classList.remove('visible'); if (now > comboUntil) $('#combo').classList.remove('visible');
  const playing = view.phase !== 'lobby';
  const targetX = hole.position.x - (!playing && innerWidth > 700 ? 7 : 0), targetZ = hole.position.z - (!playing && innerWidth <= 700 ? 5 : 0);
  cameraTarget.lerp(new THREE.Vector3(targetX, 0, targetZ), 1 - Math.exp(-dt * 3));
  const span = (playing ? 15 : 24) + player.radius * 1.35, aspect = innerWidth / innerHeight, halfHeight = aspect < .8 ? span * 1.15 : span;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.position.copy(cameraTarget).add(cameraOffset); camera.lookAt(cameraTarget); camera.updateProjectionMatrix(); renderer.render(scene, camera);
}
const mapChoices = Object.values(MAPS).map(({ id, name, preview }) => ({ id, label: name, preview }));
const homeMapPicker = createMapPicker($('#map-picker'), mapChoices, mapId => {
  if (room || busy) return false;
  selectedMapId = mapId; selectMode(selectedMode);
});
const roomMapPicker = createMapPicker($('#room-map-picker'), mapChoices, mapId => {
  if (!room?.isHost || !room.selectMap(mapId)) return false;
  selectedMapId = view.mapId; homeMapPicker.setValue(selectedMapId);
});
homeMapPicker.setValue(selectedMapId);
$('#map-choice').hidden = mapChoices.length < 2;
selectMode('free');
const invite = new URLSearchParams(location.search).get('room')?.toUpperCase();
if (invite) { selectMode('online'); $('#room-code').value = invite; }
requestAnimationFrame(frame); $('#loading').classList.add('loaded'); $('#loading').setAttribute('aria-hidden', 'true');
