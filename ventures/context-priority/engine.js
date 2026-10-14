/* One deterministic engine, used by Node and the browser. No dependencies. */
(function (root) {
  'use strict';
  const bytes = s => new TextEncoder().encode(s).length;
  const header = '# Context priority continuation\n\nSelected complete exchanges in original order. JSONL payloads are verbatim.\n\n';
  function parse(source) {
    if (typeof source !== 'string' || !source.trim()) throw Error('Empty transcript');
    const exchanges = []; let current; let pending = new Set(); let assistant = false; let lastRole; let seenCalls = new Set();
    function finish() {
      if (!current) return;
      if (!assistant || pending.size || lastRole !== 'assistant') throw Error('Incomplete exchange ' + current.id + ': missing assistant response or tool result');
      exchanges.push(current);
    }
    for (const [index, raw] of (source.match(/[^\n]*\n|[^\n]+$/g) || []).entries()) {
      if (!raw.trim()) throw Error('Blank line at ' + (index + 1));
      let row; try { row = JSON.parse(raw); } catch { throw Error('Invalid JSON at line ' + (index + 1)); }
      const msg = row.message || row;
      const role = msg.role || row.type;
      if (!['user', 'assistant', 'tool'].includes(role) || msg.content === undefined) throw Error('Unsupported record at line ' + (index + 1) + '; use user/assistant/tool JSONL');
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      const results = blocks.filter(b => b.type === 'tool_result');
      const resultOnly = role === 'tool' || (role === 'user' && blocks.length > 0 && results.length === blocks.length);
      if (role === 'user' && !resultOnly) {
        if (results.length) throw Error('Mixed user text and tool results: normalize this export first');
        finish(); current = {id: 'e' + String(exchanges.length + 1).padStart(3, '0'), raw: ''}; pending = new Set(); assistant = false; seenCalls = new Set();
      }
      if (!current) throw Error('Transcript must start with a user prompt');
      if (role === 'assistant') {
        assistant = true;
        const calls = [...(msg.tool_calls || []).map(c => c.id), ...blocks.filter(b => b.type === 'tool_use').map(b => b.id)];
        for (const id of calls) {
          if (typeof id !== 'string' || !id || seenCalls.has(id)) throw Error('Invalid or duplicate tool call');
          pending.add(id); seenCalls.add(id);
        }
      }
      const ids = role === 'tool' ? [msg.tool_call_id] : results.map(b => b.tool_use_id);
      for (const id of ids) { if (!pending.delete(id)) throw Error('Unmatched tool result at line ' + (index + 1)); }
      current.raw += raw; lastRole = role;
    }
    finish(); return exchanges;
  }
  function block(exchange) {
    let length = 3;
    for (const match of exchange.raw.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
    const fence = '`'.repeat(length);
    return '## ' + exchange.id + '\n\n' + fence + 'jsonl\n' + exchange.raw + (exchange.raw.endsWith('\n') ? '' : '\n') + fence + '\n\n';
  }
  function select(exchanges, priorities, budget) {
    if (!Number.isSafeInteger(budget) || budget < 0) throw Error('Budget must be a nonnegative integer of UTF-8 bytes');
    if (!priorities || typeof priorities !== 'object' || Array.isArray(priorities)) throw Error('Invalid priorities');
    const ids = new Set(exchanges.map(e => e.id));
    for (const [id, priority] of Object.entries(priorities)) {
      if (!ids.has(id) || !['pinned', 'normal', 'aside'].includes(priority)) throw Error('Invalid priority entry: ' + id);
    }
    const priority = e => priorities[e.id] || 'normal';
    const selected = new Set(); const costs = new Map(exchanges.map(e => [e.id, bytes(block(e))]));
    let used = bytes(header);
    for (const e of exchanges.filter(e => priority(e) === 'pinned')) { selected.add(e.id); used += costs.get(e.id); }
    if (used > budget) throw Error('Budget too small: pinned content and packet framing require ' + used + ' bytes');
    for (const tier of ['normal','aside']) for (const e of exchanges.filter(e => priority(e) === tier)) {
      if (used + costs.get(e.id) <= budget) { selected.add(e.id); used += costs.get(e.id); }
    }
    const packet = header + exchanges.filter(e => selected.has(e.id)).map(block).join('');
    const manifest = {version: 1, budgetBytes: budget, packetBytes: bytes(packet), ordering: 'pinned first; normal next; aside last; oldest fitting first within tier; output chronological', exchanges: exchanges.map(e => ({id:e.id,priority:priority(e),bytes:costs.get(e.id),selected:selected.has(e.id),reason:selected.has(e.id)?'selected':'budget'}))};
    return {packet,manifest};
  }
  const api = {parse,select,bytes,block};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ContextPriority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
