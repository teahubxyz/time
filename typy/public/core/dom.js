// Small DOM and formatting helpers shared by every part of typy.

export const $ = id => document.getElementById(id);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const now = () => performance.now();
export const pretty = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : '0';
export const round1 = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : '0';
export const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem('typy.' + key)) ?? fallback; } catch { return fallback; } };
export const writeLocal = (key, value) => { try { localStorage.setItem('typy.' + key, JSON.stringify(value)); } catch {} };
let toastTimer;

export function setText(id, value) {
  const node = $(id), text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

export function setClass(node, name, enabled) {
  if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
}

export function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

export async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers:{...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}});
  let body;
  try { body = await response.json(); } catch { throw new Error('The server could not answer. Please try again.'); }
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message || body.message;
    const error = new Error(message || 'Something interrupted that request. Please try again.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export function spanOf(text, className = '') {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  return span;
}

export function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
