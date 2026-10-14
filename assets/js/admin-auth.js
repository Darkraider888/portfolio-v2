/* DARKRAIDER STUDIO - server-verified login UI. Never put secrets in this file. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const apiUrl = '/api/admin';
  let entered = false;
  let checking = false;

  async function jsonRequest(method, body) {
    const response = await fetch(apiUrl, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error'
    });
    let result = {};
    try { result = await response.json(); }
    catch { throw new Error('The authentication API did not return JSON. Check the Vercel deployment and API route.'); }
    return { ok: response.ok, status: response.status, result };
  }

  function message(text, kind = 'neutral') {
    const node = $('authMessage');
    if (node) {
      node.textContent = text;
      node.dataset.kind = kind;
    }
  }

  function lock() {
    entered = false;
    $('app').hidden = true;
    $('bottomBar').hidden = true;
    $('adminIntro').hidden = true;
    $('adminNotice').hidden = true;
    $('adminLogout').hidden = true;
    $('authGate').hidden = false;
    $('adminLoginForm').hidden = false;
    $('adminPassword').value = '';
    $('showAdminPassword').checked = false;
    $('adminPassword').type = 'password';
  }

  async function unlock(startEditor) {
    $('authGate').hidden = true;
    $('adminIntro').hidden = false;
    $('adminNotice').hidden = false;
    $('adminLogout').hidden = false;
    if (!entered) {
      entered = true;
      await startEditor();
    } else {
      $('app').hidden = false;
      $('bottomBar').hidden = false;
    }
  }

  async function checkSession(startEditor, initial = false) {
    if (checking) return;
    checking = true;
    try {
      const result = await jsonRequest('GET');
      if (result.ok && result.result.authenticated === true) {
        await unlock(startEditor);
      } else {
        lock();
        message(result.status === 503
          ? (result.result.error || 'Admin authentication has not been configured for this deployment.')
          : initial ? 'Enter your admin code to continue.' : 'Your session expired. Sign in again.',
        result.status === 503 ? 'error' : 'neutral');
      }
    } catch (error) {
      lock();
      message(error.message || 'Cannot reach the authentication server.', 'error');
    } finally {
      checking = false;
    }
  }

  function start(startEditor) {
    if (typeof startEditor !== 'function') throw new Error('Editor entry point is missing');
    const form = $('adminLoginForm');
    const button = $('adminLoginButton');
    const secretInput = $('adminPassword');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      const password = secretInput.value;
      button.disabled = true;
      message('Verifying your code...');
      try {
        const response = await jsonRequest('POST', { password });
        secretInput.value = '';
        if (response.ok && response.result.authenticated) {
          await unlock(startEditor);
        } else {
          message(response.result.error || 'Sign in failed.', 'error');
        }
      } catch (error) {
        secretInput.value = '';
        message(error.message || 'Unable to sign in.', 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('adminLogout').addEventListener('click', async () => {
      const button = $('adminLogout');
      button.disabled = true;
      let serverConfirmed = false;
      try {
        const result = await jsonRequest('DELETE');
        serverConfirmed = result.ok;
      } catch { /* Hide editor on any error; do not claim the cookie was removed. */ }
      lock();
      message(serverConfirmed
        ? 'Signed out. Local drafts remain in this browser.'
        : 'Could not confirm sign out with the server. Please retry or close this tab.',
        serverConfirmed ? 'neutral' : 'error');
      button.disabled = false;
    });

    $('showAdminPassword').addEventListener('change', () => {
      secretInput.type = $('showAdminPassword').checked ? 'text' : 'password';
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && entered) void checkSession(startEditor);
    });
    setInterval(() => {
      if (entered && !document.hidden) void checkSession(startEditor);
    }, 120000);
    void checkSession(startEditor, true);
  }

  window.PortfolioAdminAuth = { start };
})();
