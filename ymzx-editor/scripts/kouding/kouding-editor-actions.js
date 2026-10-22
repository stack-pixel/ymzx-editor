/* Uses the editor's existing module instance and its own import/save pipeline. */
(function () {
  'use strict';
  var modulePromise;
  var mutationActive = false;
  var unsettledImport = false;
  var editorErrors = [];
  var originalConsoleError = console.error;
  console.error = function () {
    var values = Array.prototype.slice.call(arguments);
    if (values.some(function (value) { return /importProject|onImportProject|updateWorkspace/i.test(String(value)); })) {
      editorErrors.push(values.map(function (value) { return value && value.stack ? String(value.stack) : String(value); }).join(' ').slice(0, 6000));
      if (editorErrors.length > 20) editorErrors.shift();
    }
    return originalConsoleError.apply(console, values);
  };
  var delay = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  function getModule() {
    if (!window.System || !window.System.import) throw new Error('This adapter requires the verified file/legacy frontend');
    if (!modulePromise) modulePromise = window.System.import(new URL('./assets/blocks-legacy-C8Gou0MR.js', document.baseURI).href);
    return modulePromise;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function ignoredKey(key,value,fieldName,parentType) {
    if (key === 'saveTime' || key === 'globalVersion' || key === 'blockStr') return true;
    // Blockly can move a top-level stack after its inputs finish rendering.
    // These are canvas coordinates; in-game vector inputs remain field data.
    if ((key === 'x' || key === 'y') && value && typeof value.type === 'string' && typeof value.id === 'string' && typeof value[key] === 'number') return true;
    // Toolbox templates may retain kind=BLOCK on an automatically added shadow,
    // while workspace serialization omits it. Type and field values stay strict.
    if (key === 'kind' && fieldName === 'shadow' && value && value.kind === 'BLOCK' && typeof value.type === 'string') return true;
    if (key === 'blockName' && fieldName === 'extraState' && /^pin_(event|array)_/.test(parentType || '')) return true;
    // Native pickers refresh display labels for the same bound resource. IDs
    // and values remain semantic; ordinary text blocks are never exempted.
    return (fieldName === 'varName' || fieldName === 'inputName') && value &&
      typeof value.dataId === 'string' && Object.prototype.hasOwnProperty.call(value,'value') &&
      typeof value.text === 'string' && typeof value.originText === 'string' &&
      (key === 'text' || key === 'originText');
  }
  function canonical(value,fieldName,parentType) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(function (key) { return !ignoredKey(key,value,fieldName,parentType); }).map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key],key,value.type); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function nativeCall(method, params) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Native callback timeout: ' + method)); }, 10000);
      window.letsgo.callFunction(method, params, function (value) {
        clearTimeout(timer);
        if (value && value.ret !== undefined && value.ret !== 0) reject(new Error('Native error: ' + value.ret));
        else resolve(value);
      });
    });
  }
  function decode(value) {
    for (var i = 0; i < 3 && typeof value === 'string'; i++) { try { value = JSON.parse(value); } catch (_) { break; } }
    return value;
  }
  async function guard(m, params) {
    var listing = decode((await nativeCall('GetUGCPList', {})).data);
    var project = clone(m.s.projectStore.exportCurrProject());
    if (String(listing.mapId) !== params.mapId || listing.selectId !== params.projectId || project.blocklyFileId !== params.projectId) throw new Error('Selected map/project changed; refusing mutation');
    if (m.s.editorStore.loading) throw new Error('Editor is loading');
    if (!canvasConsistent(m, project)) throw new Error('Live canvas and exported project differ; inspect before mutation');
    if (canonical(project) !== canonical(params.expectedProject)) throw new Error('Project changed since inspection; inspect again');
    return project;
  }
  function canvasConsistent(m, project) {
    var workspace=m.s.editorStore.workspace;
    var active=m.s.projectStore.getCurrTriggerGroup && m.s.projectStore.getCurrTriggerGroup();
    if (!workspace || !active || !window.Blockly.serialization) return true;
    var group=project.triggerGroups.find(function(g){return g.id===active.id;});
    if (!group) return false;
    var live=window.Blockly.serialization.workspaces.save(workspace);
    return requestedContentPresent(live.blocks, group.state && group.state.blocks);
  }
  function canvasDifference(m, project) {
    var workspace=m.s.editorStore.workspace;
    var active=m.s.projectStore.getCurrTriggerGroup && m.s.projectStore.getCurrTriggerGroup();
    var group=active && project.triggerGroups.find(function(g){return g.id===active.id;});
    if (!workspace || !group || !window.Blockly.serialization) return null;
    return firstDifference(window.Blockly.serialization.workspaces.save(workspace).blocks,group.state && group.state.blocks,'workspace.blocks');
  }
  async function requireActivePage() {
    if (document.visibilityState === 'hidden' || typeof window.requestAnimationFrame !== 'function') throw new Error('Open the Kouding page before editor mutations');
    await new Promise(function(resolve,reject){
      var timer=setTimeout(function(){reject(new Error('Kouding page is not rendering; no mutation sent'));},1500);
      window.requestAnimationFrame(function(){clearTimeout(timer);resolve();});
    });
  }
  function requestedContentPresent(actual, requested, fieldName, parentType) {
    // Verify every requested semantic field, allowing editor-added defaults.
    if (requested === null || typeof requested !== 'object') return actual === requested;
    if (!actual || typeof actual !== 'object') return false;
    if (Array.isArray(requested)) return Array.isArray(actual) && actual.length === requested.length && requested.every(function (value, i) { return requestedContentPresent(actual[i], value); });
    return Object.keys(requested).filter(function (key) { return !ignoredKey(key,requested,fieldName,parentType); }).every(function (key) { return requestedContentPresent(actual[key], requested[key],key,requested.type); });
  }
  function firstDifference(actual, requested, path, parentType) {
    path = path || 'project';
    if (requestedContentPresent(actual, requested, path.split('.').slice(-1)[0],parentType)) return null;
    if (requested && actual && typeof requested === 'object' && typeof actual === 'object') {
      if (Array.isArray(requested) && (!Array.isArray(actual) || actual.length !== requested.length)) return path + '.length: expected ' + requested.length + ', got ' + actual.length;
      var keys = Object.keys(requested).filter(function (key) { return !ignoredKey(key,requested,path.split('.').slice(-1)[0],parentType); });
      for (var i = 0; i < keys.length; i++) {
        var found = firstDifference(actual[keys[i]], requested[keys[i]], path + '.' + keys[i],requested.type);
        if (found) return found;
      }
    }
    return path + ': expected ' + String(JSON.stringify(requested)).slice(0, 180) + ', got ' + String(JSON.stringify(actual)).slice(0, 180);
  }
  async function waitForProject(m, requested) {
    var stable = 0;
    for (var i = 0; i < 60; i++) {
      await delay(100);
      var actual = clone(m.s.projectStore.exportCurrProject());
      var workspace = m.s.editorStore.workspace;
      var active = m.s.projectStore.getCurrTriggerGroup && m.s.projectStore.getCurrTriggerGroup();
      var requestedGroup = active && requested.triggerGroups.find(function (group) { return group.id === active.id; });
      var liveMatches = true;
      if (workspace && requestedGroup && window.Blockly.serialization) {
        var live = window.Blockly.serialization.workspaces.save(workspace);
        liveMatches = requestedContentPresent(live.blocks, requestedGroup.state.blocks);
      }
      if (!m.s.editorStore.loading && liveMatches && requestedContentPresent(actual, requested)) stable++;
      else stable = 0;
      if (stable >= 10) return actual;
    }
    var mismatch = firstDifference(actual, requested);
    if (!mismatch && live && requestedGroup) mismatch = firstDifference(live.blocks, requestedGroup.state.blocks, 'workspace.blocks');
    throw new Error('Imported project did not match requested content: ' + (mismatch || 'editor remained loading'));
  }
  window.__codexEditorActions = {
    execute: async function (method, params) {
      var m = await getModule();
      if (!m.s || !m.s.projectStore || typeof m.$ !== 'function' || typeof m.ab !== 'function') throw new Error('Unsupported frontend module exports');
      if (method === 'editorInfo') {
        var listing = decode((await nativeCall('GetUGCPList', {})).data);
        var definitions = {};
        var schemas = {};
        var messages = {};
        (params.types || []).forEach(function (type) {
          var prefix = type.toUpperCase();
          Object.keys(window.Blockly.Msg || {}).filter(function (key) { return key === prefix || key.indexOf(prefix + '_') === 0; }).forEach(function (key) { messages[key] = window.Blockly.Msg[key]; });
          var def = window.Blockly.Blocks[type];
          var source = def && def.init ? String(def.init) : null;
          definitions[type] = source;
          // A pure wrapper exposes its already-created schema through a stub, without creating blocks or a workspace.
          if (source && /^function\s*\(\)\s*\{\s*this\.jsonInit\([A-Za-z_$][\w$]*\)\s*;?\s*\}$/.test(source)) {
            def.init.call({ jsonInit: function (value) { schemas[type] = clone(value); } });
          }
        });
        var inspected=clone(m.s.projectStore.exportCurrProject());
        return { adapterRevision: 10, pageVisibility: document.visibilityState, canvasConsistent: canvasConsistent(m, inspected), canvasDifference: canvasDifference(m, inspected), unsettledImport: unsettledImport, errors: editorErrors.slice(), validationErrorCount: m.s.debugStore.errorCount, mapId: String(listing.mapId), projectId: listing.selectId, project: inspected, playerNumberOptions: clone(m.l.getGameObjectVariableDropdown('PlayerAttributeNumber')), logLevelOptions: clone(m.l.getGameObjectVariableDropdown('LogLevel')), blockTypes: Object.keys(window.Blockly.Blocks).sort(), schemas: schemas, definitions: definitions, messages: messages };
      }
      if (mutationActive || unsettledImport) throw new Error('An earlier editor import is active or unsettled; inspect before mutation');
      mutationActive=true;
      try {
      await requireActivePage();
      var before = await guard(m, params);
      if (method === 'applyProject') {
        if (!params.project || params.project.blocklyFileId !== before.blocklyFileId || params.project.codeFileId !== before.codeFileId || params.project.type !== before.type) throw new Error('Project identity must be preserved');
        try {
          unsettledImport=true;
          m.$(clone(params.project), false);
          var imported = await waitForProject(m, params.project);
          unsettledImport=false;
          return { applied: true, saved: false, project: imported };
        } catch (error) {
          if (document.visibilityState === 'hidden' || m.s.editorStore.loading) throw new Error(error.message + '; import may still be loading, automatic rollback not attempted');
          await requireActivePage();
          m.$(before, false);
          try { await waitForProject(m, before); } catch (_) { throw new Error(error.message + '; automatic rollback could not be verified'); }
          unsettledImport=false;
          throw new Error(error.message + '; previous canvas restored');
        }
      }
      if (method === 'saveProject') {
        await m.ab('Stash');
        var saved = decode((await nativeCall('GetCode', { fileId: before.blocklyFileId })).data);
        if (!requestedContentPresent(saved, before)) throw new Error('Saved project readback does not match canvas');
        return { saved: true, scope: 'editor stash', project: saved };
      }
      if (method === 'tryPlay') {
        await m.ab('TryPlay');
        m.s.debugStore.tryPlay();
        // This opens the normal game preview; a request acknowledgment is not a passed test.
        window.letsgo.callFunction('TryPlay', { id: before.blocklyFileId });
        return { requested: true, tested: false };
      }
      if (method === 'reloadPage') {
        var savedBefore = decode((await nativeCall('GetCode', { fileId: before.blocklyFileId })).data);
        if (!requestedContentPresent(savedBefore, before)) throw new Error('Save canvas before reload');
        setTimeout(function () { window.location.reload(); }, 1000);
        return { reloadScheduled: true };
      }
      throw new Error('Unknown editor action');
      } finally { mutationActive=false; }
    },
  };
})();
