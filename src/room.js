import { Match, cleanName, MAX_PLAYERS } from './match.js';
import { MAPS } from './maps/index.js';

// Map layouts are rebuilt locally from snapshots. Keep clients with older
// layouts/rigid-body pose messages out of these rooms to avoid simulation drift.
const PREFIX = 'little-black-hole-v4-';
export const validRoomCode = code => /^[A-Z2-9]{8}$/.test(code);
export function newRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), value => alphabet[value % alphabet.length]).join('');
}

export class Room {
  constructor({ onSnapshot, onError, onStatus, beforeInput }) {
    this.onSnapshot = onSnapshot; this.onError = onError; this.onStatus = onStatus;
    this.beforeInput = beforeInput;
    this.connections = new Map(); this.closed = false; this.isHost = false;
  }
  async openPeer(id) {
    const { Peer } = await import('peerjs');
    if (this.closed) throw new Error('连接已取消');
    this.peer = id ? new Peer(id) : new Peer();
    this.peer.on('error', error => {
      if (!this.closed) this.fail(({ 'unavailable-id': '房间号已被占用，请重新创建。', 'peer-unavailable': '房间已关闭，或房间号有误。', network: '连接服务暂时不可用，请稍后重试。', 'webrtc': '直连失败，请换一个网络重试。' })[error.type] || '联机连接发生错误，请重新进入房间。');
    });
    this.peer.on('disconnected', () => { if (!this.closed) this.fail('房间连接已断开，请重新进入房间。'); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('连接超时，请检查网络后重试。')), 15000);
      this.peer.once('open', () => { clearTimeout(timeout); resolve(); });
      this.peer.once('error', error => { clearTimeout(timeout); reject(error); });
    });
    if (this.closed) throw new Error('连接已取消');
    this.selfId = this.peer.id;
  }
  async create(name, mode, mapId) {
    this.isHost = true; this.code = newRoomCode();
    await this.openPeer(PREFIX + this.code);
    this.game = new Match(mode, undefined, mapId);
    this.game.addPlayer(this.selfId, name);
    this.peer.on('connection', connection => {
      connection.on('open', () => {
        if (this.game.phase !== 'lobby' || this.game.players.length >= MAX_PLAYERS) {
          connection.send({ type: 'rejected', message: this.game.phase !== 'lobby' ? '本轮已经开始，请等房主开启下一轮。' : '房间已满，最多 4 人。' });
          setTimeout(() => connection.close(), 300); return;
        }
        const joined = this.game.addPlayer(connection.peer, connection.metadata?.name);
        if (!joined) { connection.close(); return; }
        this.connections.set(connection.peer, connection); this.publish();
      });
      connection.on('data', message => {
        if (!this.connections.has(connection.peer) || !message || typeof message !== 'object') return;
        if (message.type === 'input') { this.beforeInput?.(); this.game.setInput(connection.peer, message.input); }
        if (message.type === 'ready' && message.round === this.game.round) { this.game.setReady(connection.peer, message.ready); this.publish(); }
      });
      const remove = () => { if (this.connections.delete(connection.peer)) { this.game.removePlayer(connection.peer); this.publish(); } };
      connection.on('close', remove); connection.on('error', () => { remove(); connection.close(); });
    });
    this.onStatus('房间已创建，邀请朋友进来吧'); this.publish();
  }
  async join(code, name) {
    this.code = code;
    await this.openPeer();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('连接房主超时，请换一个网络或重新创建房间。')), 20000);
      const connection = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'binary', metadata: { name: cleanName(name) } });
      this.hostConnection = connection;
      connection.on('data', message => {
        if (this.closed || !message || typeof message !== 'object') return;
        if (message.type === 'rejected') { clearTimeout(timeout); reject(new Error(message.message)); this.fail(message.message); }
        if (message.type === 'snapshot') { clearTimeout(timeout); this.round = message.snapshot.round; this.onSnapshot(message.snapshot); resolve(); }
      });
      connection.on('close', () => { clearTimeout(timeout); if (!this.closed) { reject(new Error('房主已离开，房间已结束。')); this.fail('房主已离开，房间已结束。'); } });
      connection.on('error', () => { clearTimeout(timeout); reject(new Error('无法连接房主，请重新加入。')); this.fail('与房主的连接发生错误，请重新加入。'); });
    });
    this.onStatus('已加入房间，准备好就出发');
  }
  publish() {
    if (!this.game || this.closed) return;
    const snapshot = this.game.snapshot(); this.round = snapshot.round; this.onSnapshot(snapshot);
    for (const connection of this.connections.values()) if (connection.open) connection.send({ type: 'snapshot', snapshot });
  }
  input(input) {
    if (this.isHost) this.game?.setInput(this.selfId, input);
    else if (this.hostConnection?.open) this.hostConnection.send({ type: 'input', input });
  }
  ready(ready) {
    if (this.isHost) { this.game.setReady(this.selfId, ready); this.publish(); }
    else if (this.hostConnection?.open) this.hostConnection.send({ type: 'ready', ready, round: this.round });
  }
  selectMap(mapId) {
    if (this.closed || !this.isHost || this.game?.phase !== 'lobby' || typeof mapId !== 'string' || !Object.hasOwn(MAPS, mapId) || mapId === this.game.mapId) return false;
    this.#resetLobby(mapId, this.game.players);
    return true;
  }
  #resetLobby(mapId, players) {
    const old = this.game;
    // Rapid map changes and rematches can occur within the same millisecond.
    // A new round must still get a different layout seed.
    const now = Date.now() >>> 0;
    const seed = now === old.seed ? (now + 1) >>> 0 : now;
    this.game = new Match(old.mode, seed, mapId);
    for (const player of players) {
      this.game.addPlayer(player.id, player.name);
      Object.assign(this.game.players.at(-1), { color: player.color, online: player.online, ready: player.id === this.selfId });
    }
    this.publish();
  }
  rematch() {
    if (this.closed || !this.isHost || this.game?.phase !== 'finished') return false;
    this.#resetLobby(this.game.mapId, this.game.players.filter(player => player.online));
    return true;
  }
  fail(message) { if (!this.closed) { this.onError(message); this.close(); } }
  close() {
    this.closed = true;
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear(); this.hostConnection?.close(); this.peer?.destroy();
  }
}
