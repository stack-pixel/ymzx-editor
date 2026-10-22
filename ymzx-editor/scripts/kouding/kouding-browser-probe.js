/* Typed editor bridge. Configuration is added by install-kouding-probe.mjs. */
(function (settings) {
  'use strict';
  if (window.__codexKoudingReadProbe) return;
  window.__codexKoudingReadProbe = { installed: true, version: 2 };
  var allow = ['GetUGCPList', 'GetCode', 'GetUGCPDebugState', 'GetUGCPDebugData', 'GetUGCPErrorData', 'GetUGCPOutputLogData', 'GetUGCPProfileData', 'GetAllActorCount'];
  var base = 'http://127.0.0.1:' + settings.port;
  var headers = { 'Content-Type': 'application/json', 'X-Ymzx-Key': settings.token };
  async function exchange(route, payload) {
    var control = new AbortController();
    var timer = setTimeout(function () { control.abort(); }, 4000);
    try {
      var response = await fetch(base + route, { method: payload ? 'POST' : 'GET', headers: headers, body: payload ? JSON.stringify(payload) : undefined, signal: control.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Bridge HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function snapshot() {
    var b = window.Blockly;
    var workspace = b && typeof b.getMainWorkspace === 'function' ? b.getMainWorkspace() : null;
    if (!workspace) return { ready: false, reason: 'No exposed Blockly workspace' };
    var blocks = workspace.getAllBlocks(false).map(function (block) {
      return { id: block.id, type: block.type, parentId: block.getParent() ? block.getParent().id : null };
    });
    var xml = b.Xml && b.Xml.workspaceToDom && b.Xml.domToText ? b.Xml.domToText(b.Xml.workspaceToDom(workspace)) : null;
    return { ready: true, blocks: blocks, xml: xml, blockTypeCount: Object.keys(b.Blocks || {}).length };
  }
  function execute(job) {
    if (job.method === 'snapshot') return Promise.resolve(snapshot());
    if (['sceneReferences', 'resourceReferences', 'staticTypes', 'resourceMenu', 'resourceList', 'resourcePage', 'resourceItems'].indexOf(job.method) >= 0) {
      if (!window.__codexNativeSceneActions) return Promise.reject(new Error('Native scene adapter not loaded'));
      return window.__codexNativeSceneActions.execute(job.method, job.params || {});
    }
    if (['editorInfo', 'applyProject', 'saveProject', 'tryPlay', 'reloadPage'].indexOf(job.method) >= 0) {
      if (!window.__codexEditorActions) return Promise.reject(new Error('Editor adapter not loaded'));
      return window.__codexEditorActions.execute(job.method, job.params || {});
    }
    if (allow.indexOf(job.method) < 0) return Promise.reject(new Error('Write or unknown method denied'));
    var params = job.params || {};
    if (job.method === 'GetCode') {
      if (Object.keys(params).length !== 1 || typeof params.fileId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.fileId)) return Promise.reject(new Error('Invalid fileId'));
    } else if (Object.keys(params).length) return Promise.reject(new Error('Unexpected parameters'));
    if (!window.letsgo || !window.letsgo.callFunction || window.letsgo.isInWebPage()) return Promise.reject(new Error('Native bridge not ready'));
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Native callback timeout')); }, 8000);
      window.letsgo.callFunction(job.method, params, function (value) { clearTimeout(timer); resolve(value); });
    });
  }
  async function tick() {
    try {
      await exchange('/browser/hello', { ready: !!(window.letsgo && !window.letsgo.isInWebPage()), blockly: !!window.Blockly, version: 2 });
      var response = await exchange('/browser/poll');
      if (response.job) {
        var message = { id: response.job.id };
        try { message.result = await execute(response.job); } catch (error) { message.error = error.message; }
        await exchange('/browser/result', message);
      }
    } catch (_) { /* The game remains usable when the local bridge is stopped. */ }
    setTimeout(tick, 2000);
  }
  tick();
})(window.__codexKoudingReadConfig);
