/* Public English enquiries. Conversation state lives only in this document. */
(function () {
  'use strict';

  // Keep the endpoint here so the host can adapt its existing public API route.
  var CHAT_API_URL = '/api/english-chat';
  var REQUEST_TIMEOUT_MS = 60000;
  var MAX_QUESTION_LENGTH = 4000;
  var MAX_SOURCES = 20;
  var ENGLISH_INSTRUCTION = 'Please answer in natural English. Use plain text without Markdown formatting, and keep replies concise unless the user asks for more detail.\n\n';

  var form = document.getElementById('chat-form');
  var input = document.getElementById('question');
  var send = document.getElementById('send');
  var newChat = document.getElementById('new-chat');
  var welcome = document.getElementById('welcome');
  var messages = document.getElementById('messages');
  var scrollArea = document.getElementById('chat-main');
  var status = document.getElementById('chat-status');
  var count = document.getElementById('character-count');
  if (!form || !input || !send || !newChat || !welcome || !messages || !scrollArea || !status || !count) return;

  var history = [];
  var conversationToken = null;
  var activeRequest = null;
  var accountScope = null;
  var scopeReady = false;
  var sessionChanged = false;
  var pageClosed = false;

  function setStatus(message, error) {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
  }

  function updateCount() {
    count.textContent = input.value.length.toLocaleString('en-US') + ' / 4,000';
  }

  function scrollToLatest() {
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  function setPending(pending) {
    input.readOnly = pending;
    send.textContent = pending ? 'Stop' : 'Send';
    send.dataset.pending = String(pending);
    send.setAttribute('aria-label', pending ? 'Stop the current response' : 'Send your question');
    send.disabled = !scopeReady || sessionChanged || pageClosed;
    newChat.disabled = !scopeReady || sessionChanged || pageClosed;
    messages.setAttribute('aria-busy', String(pending));
  }

  function clearConversation() {
    history = [];
    conversationToken = null;
    messages.replaceChildren();
    welcome.hidden = false;
    input.value = '';
    updateCount();
    scrollArea.scrollTop = 0;
  }

  function invalidateSession() {
    sessionChanged = true;
    scopeReady = false;
    if (activeRequest) {
      var previousRequest = activeRequest;
      activeRequest = null;
      window.clearTimeout(previousRequest.timeout);
      previousRequest.controller.abort();
    }
    clearConversation();
    setPending(false);
    setStatus('Your session has changed. This conversation has been cleared. Refresh this page to continue.', true);
  }

  function assertRequest(request) {
    if (activeRequest !== request || pageClosed || sessionChanged) throw new Error('inactive_request');
    if (request.cancelled || request.timedOut || request.controller.signal.aborted) throw new Error('request_aborted');
  }

  async function initializeAccountScope() {
    setStatus('Connecting to the assistant…', false);
    try {
      var module = await import('./scope.js?v=20261018-panel');
      if (pageClosed) return;
      var scope = await module.createAccountScope({ doc: null });
      if (pageClosed) { scope.close(); return; }
      accountScope = scope;
      // This is the public module's callback property, not an event emitter.
      scope.onInvalidate = invalidateSession;
      if (scope.changed) { invalidateSession(); return; }
      scopeReady = true;
      setPending(false);
      setStatus('', false);
    } catch (error) {
      if (pageClosed) return;
      scopeReady = false;
      setPending(false);
      setStatus('We could not start the assistant. Refresh this page to try again.', true);
    }
  }

  function appendMessage(role, text, thinking) {
    var article = document.createElement('article');
    article.className = 'message message-' + role + (thinking ? ' message-thinking' : '');
    var label = document.createElement('p');
    label.className = 'message-label';
    label.textContent = role === 'user' ? 'You' : 'OriginMind';
    var content = document.createElement('p');
    content.className = 'message-content';
    content.textContent = text;
    article.appendChild(label);
    article.appendChild(content);
    messages.appendChild(article);
    return article;
  }

  function safeSources(rawSources) {
    if (!Array.isArray(rawSources)) return [];
    var seen = new Set();
    var sources = [];
    rawSources.slice(0, MAX_SOURCES).forEach(function (source) {
      var rawUrl = typeof source === 'string' ? source : source && (source.url || source.href);
      if (typeof rawUrl !== 'string') return;
      try {
        // Absolute HTTPS links only. Never accept scripts, local routes or credentials.
        var url = new URL(rawUrl);
        if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) return;
        seen.add(url.href);
        var suppliedTitle = source && typeof source === 'object' && (source.title || source.name);
        var title = typeof suppliedTitle === 'string' && suppliedTitle.trim() ? suppliedTitle.trim().slice(0, 250) : url.hostname;
        sources.push({ url: url.href, title: title });
      } catch (error) {
        // Invalid URLs are omitted rather than inserted into the document.
      }
    });
    return sources;
  }

  function appendSources(article, sources) {
    if (!sources.length) return;
    var section = document.createElement('div');
    section.className = 'message-sources';
    var heading = document.createElement('h2');
    heading.textContent = 'Sources';
    var list = document.createElement('ul');
    sources.forEach(function (source) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title;
      link.setAttribute('aria-label', source.title + ' (opens in a new tab)');
      item.appendChild(link);
      list.appendChild(item);
    });
    section.appendChild(heading);
    section.appendChild(list);
    article.appendChild(section);
  }

  function failureMessage(request, httpStatus) {
    if (request.cancelled) return 'Response stopped. Your question is still in the editor.';
    if (request.timedOut) return 'The response took too long. Your question is still in the editor. Please try again.';
    if (httpStatus === 409) return 'We could not continue this conversation. Your question is still in the editor. Please select New chat or try again.';
    if (httpStatus === 429) return 'The assistant is receiving too many requests. Please try again in a moment.';
    if (httpStatus === 400 || httpStatus === 413) return 'We could not process this question. Please shorten or rephrase it and try again.';
    return 'We could not get a response. Your question is still in the editor. Please try again shortly.';
  }

  async function askQuestion() {
    if (activeRequest || !scopeReady || sessionChanged || pageClosed || !accountScope) return;
    var question = input.value.trim();
    if (!question) {
      setStatus('Please enter a question.', true);
      input.focus();
      return;
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      setStatus('Please keep your question within 4,000 characters.', true);
      input.focus();
      return;
    }
    var request = {
      controller: new AbortController(),
      cancelled: false,
      timedOut: false,
      userMessage: null,
      thinkingMessage: null,
      timeout: null,
      ticket: null,
      scopeAbort: null
    };
    activeRequest = request;
    setStatus('', false);
    welcome.hidden = true;
    request.userMessage = appendMessage('user', question, false);
    request.thinkingMessage = appendMessage('assistant', 'Thinking…', true);
    setPending(true);
    scrollToLatest();

    var body = {
      topic: 'research',
      messages: [{ role: 'user', content: ENGLISH_INSTRUCTION + question }]
    };
    if (conversationToken) body.conversationToken = conversationToken;

    var httpStatus = null;
    try {
      await accountScope.verify();
      assertRequest(request);
      request.ticket = accountScope.capture();
      accountScope.assert(request.ticket);
      request.scopeAbort = function () { request.controller.abort(); };
      request.ticket.controller.signal.addEventListener('abort', request.scopeAbort, { once: true });
      if (request.ticket.controller.signal.aborted) request.scopeAbort();
      assertRequest(request);
      request.timeout = window.setTimeout(function () {
        request.timedOut = true;
        request.controller.abort();
      }, REQUEST_TIMEOUT_MS);
      var response = await fetch(CHAT_API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-OmindOS-Expected-Account': request.ticket.id },
        body: JSON.stringify(body),
        signal: request.controller.signal
      });
      if (activeRequest !== request) return;
      assertRequest(request);
      httpStatus = response.status;
      if (httpStatus === 409) {
        conversationToken = null;
        await accountScope.verify();
        assertRequest(request);
        accountScope.assert(request.ticket);
      }
      if (!response.ok) throw new Error('request_failed');
      var contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().indexOf('application/json') === -1) throw new Error('unexpected_response_type');
      var data = await response.json();
      if (activeRequest !== request) return;
      assertRequest(request);
      await accountScope.verify();
      assertRequest(request);
      accountScope.assert(request.ticket);
      if (!data || typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('empty_answer');
      var sources = safeSources(data.sources);
      request.thinkingMessage.remove();
      request.thinkingMessage = null;
      var answer = appendMessage('assistant', data.answer, false);
      appendSources(answer, sources);
      history.push({ role: 'user', content: question });
      history.push({ role: 'assistant', content: data.answer, sources: sources });
      if (typeof data.conversationToken === 'string' && data.conversationToken.length <= 40000) {
        conversationToken = data.conversationToken || null;
      }
      input.value = '';
      updateCount();
      setStatus('', false);
      scrollToLatest();
    } catch (error) {
      if (activeRequest !== request) return;
      if (accountScope.changed) { invalidateSession(); return; }
      if (request.userMessage) request.userMessage.remove();
      if (request.thinkingMessage) request.thinkingMessage.remove();
      welcome.hidden = history.length > 0;
      setStatus(failureMessage(request, httpStatus), !request.cancelled);
      scrollToLatest();
    } finally {
      window.clearTimeout(request.timeout);
      if (request.ticket) {
        if (request.scopeAbort) request.ticket.controller.signal.removeEventListener('abort', request.scopeAbort);
        accountScope.release(request.ticket);
      }
      if (activeRequest === request) {
        activeRequest = null;
        setPending(false);
        input.focus();
      }
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (activeRequest) {
      activeRequest.cancelled = true;
      activeRequest.controller.abort();
      return;
    }
    askQuestion();
  });

  input.addEventListener('input', function () {
    updateCount();
    if (scopeReady && !sessionChanged && !pageClosed && status.textContent) setStatus('', false);
  });

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!activeRequest) form.requestSubmit();
  });

  newChat.addEventListener('click', function () {
    if (!scopeReady || sessionChanged || pageClosed) return;
    if (activeRequest) {
      var previousRequest = activeRequest;
      activeRequest = null;
      window.clearTimeout(previousRequest.timeout);
      previousRequest.controller.abort();
    }
    clearConversation();
    setStatus('', false);
    setPending(false);
    input.focus();
  });

  window.addEventListener('pagehide', function () {
    pageClosed = true;
    scopeReady = false;
    if (activeRequest) {
      var previousRequest = activeRequest;
      activeRequest = null;
      window.clearTimeout(previousRequest.timeout);
      previousRequest.controller.abort();
    }
    if (accountScope) accountScope.close();
    clearConversation();
    setPending(false);
    setStatus('This chat session has closed. Refresh this page to continue.', false);
  });

  updateCount();
  setPending(false);
  initializeAccountScope();
}());

