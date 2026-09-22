'use strict';

// Тонкий клиент к сокету herdr — на один запрос и ответ.
//
// Нужен ровно ради `agent.view.*`: у этих двух методов нет обёртки в CLI, а
// без них агента из панели сайдбара не убрать. Всё остальное плагин делает
// через `herdr`, как и советует документация.
//
// Протокол — JSON построчно: запрос строкой, ответ строкой с тем же `id`.
// На Windows сокет — именованная труба, и имя у неё то же, что путь к файлу
// сокета, только с приставкой `\\.\pipe\`; сам файл сокетом не является и
// хранит лишь pid сервера.

const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function socketPath() {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'herdr', 'herdr.sock');
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'herdr', 'herdr.sock');
}

function endpoint() {
  const file = socketPath();
  return process.platform === 'win32' ? `\\\\.\\pipe\\${file}` : file;
}

const TIMEOUT_MS = 5000;

function request(method, params = {}, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ path: endpoint() });
    let buffer = '';
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => finish(new Error(`herdr did not answer ${method} in ${timeout}ms`)), timeout);
    timer.unref?.();

    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id: `agent-tasks-${Date.now()}`, method, params })}\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const line = buffer.split('\n')[0];
      if (!buffer.includes('\n')) return;
      clearTimeout(timer);
      let answer;
      try {
        answer = JSON.parse(line);
      } catch (error) {
        finish(new Error(`herdr answered ${method} with something that is not JSON: ${error.message}`));
        return;
      }
      if (answer.error) {
        const error = new Error(answer.error.message || answer.error.code || `${method} refused`);
        error.code = answer.error.code;
        finish(error);
        return;
      }
      finish(null, answer.result);
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      finish(new Error(`herdr socket (${endpoint()}): ${error.code || error.message}`));
    });
  });
}

module.exports = { request, socketPath, endpoint };
