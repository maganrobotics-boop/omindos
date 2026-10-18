/* The website uses a dedicated anonymous session; account sign-in stays on .cn. */
export async function createAccountScope() {
  const read = async () => {
    const response = await fetch('/api/english-chat/session', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) {
      const code = typeof result.code === 'string' && /^[a-z_]+$/.test(result.code) ? result.code : 'unavailable';
      throw new Error(`session_${response.status}_${code}`);
    }
    const { account } = result;
    if (account?.kind !== 'guest' || !/^[A-Za-z0-9_-]{16,160}$/.test(account.id)) throw new Error('invalid_session');
    return account;
  };
  const account = await read();
  const tickets = new Set();
  let changed = false;
  const scope = {
    account, onInvalidate: null,
    get changed() { return changed; },
    capture() {
      if (changed) throw new DOMException('Session changed', 'AbortError');
      const ticket = { id: account.id, controller: new AbortController() };
      tickets.add(ticket);
      return ticket;
    },
    assert(ticket) {
      if (changed || ticket?.id !== account.id || ticket.controller.signal.aborted) throw new DOMException('Session changed', 'AbortError');
    },
    release(ticket) { tickets.delete(ticket); },
    invalidate() {
      if (changed) return;
      changed = true;
      for (const ticket of tickets) ticket.controller.abort();
      tickets.clear();
      scope.onInvalidate?.();
    },
    async verify() {
      const current = await read();
      if (current.id !== account.id) {
        scope.invalidate();
        throw new DOMException('Session changed', 'AbortError');
      }
      return current;
    },
    close() {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      for (const ticket of tickets) ticket.controller.abort();
      tickets.clear();
    },
  };
  let checking = false;
  const check = async () => {
    if (changed || checking) return;
    checking = true;
    try { await scope.verify(); } catch { /* Sending always verifies again. */ }
    finally { checking = false; }
  };
  window.addEventListener('focus', check);
  const timer = setInterval(check, 15000);
  return scope;
}
