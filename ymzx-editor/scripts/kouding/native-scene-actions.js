/* Native scene queries only. No gameplay source or editor scene writes. */
(function () {
  'use strict';
  var metadataSequence = 2000000000;
  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Scene callback timeout: ' + method)); }, 10000);
      window.letsgo.callFunction(method, params, function (value) {
        clearTimeout(timer);
        if (value && value.ret !== undefined && value.ret !== 0) reject(new Error('Native scene error: ' + value.ret));
        else resolve(value);
      });
    });
  }
  window.__codexNativeSceneActions = {
    execute: async function (method, params) {
      if(method==='resourceItems'){
        var required=['mapId','type','menuOrder','pageIndex'];
        if(!params||required.some(function(k){return !Object.prototype.hasOwnProperty.call(params,k);})||Object.keys(params).some(function(k){return !required.concat('subMenuOrder').includes(k);})||typeof params.mapId!=='string'||!/^\d{1,32}$/.test(params.mapId)||typeof params.type!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(params.type)||!Number.isInteger(params.menuOrder)||params.menuOrder<0||params.menuOrder>100000||!Number.isInteger(params.pageIndex)||params.pageIndex<1||params.pageIndex>100||Object.prototype.hasOwnProperty.call(params,'subMenuOrder')&&(!Number.isInteger(params.subMenuOrder)||params.subMenuOrder<0||params.subMenuOrder>100000))throw new Error('Invalid catalog page query');
        var menuResult=await window.__codexNativeSceneActions.execute('resourceMenu',{mapId:params.mapId,type:params.type});
        var selected=menuResult.items.filter(function(m){return m.menuOrder===params.menuOrder;});
        if(selected.length!==1)throw new Error('Requested catalog menu is absent or ambiguous');
        var category=selected[0];
        if(params.subMenuOrder!==undefined){var sub=(category.subMenus||[]).filter(function(m){return m.subMenuOrder===params.subMenuOrder;});if(sub.length!==1)throw new Error('Requested catalog submenu is absent or ambiguous');category=sub[0];}
        else if(category.subMenus?.length)throw new Error('Select an observed catalog submenu');
        if(!Number.isInteger(category.pageCount)||params.pageIndex>category.pageCount)throw new Error('Requested page is outside observed catalog bounds');
        if(metadataSequence>=2147483647)throw new Error('Metadata sequence exhausted');var pageSequence=++metadataSequence;
        var pageData={type:params.type,pageIndex:params.pageIndex,menuOrder:params.menuOrder};if(params.subMenuOrder!==undefined)pageData.subMenuOrder=params.subMenuOrder;
        var page=await call('GetTypeData',{seqId:pageSequence,data:pageData});
        if(page.seqId!==pageSequence||page.data?.type!==params.type||!Array.isArray(page.data.list)||page.data.list.length>20000)throw new Error('Catalog callback differs from requested type/sequence');
        var pageMap=await call('GetAllActorCount',{});if(pageMap.mapID!==params.mapId)throw new Error('Selected map changed during catalog query');
        return {mapId:params.mapId,readOnly:true,type:params.type,menuOrder:params.menuOrder,subMenuOrder:params.subMenuOrder,pageIndex:params.pageIndex,pageCount:category.pageCount,items:page.data.list};
      }
      if (['resourceMenu', 'resourceList', 'resourcePage'].includes(method)) {
        var keys=method==='resourcePage'?['mapId','type','pageIndex']:['mapId','type'];
        if(!params||Object.keys(params).length!==keys.length||keys.some(function(k){return !Object.prototype.hasOwnProperty.call(params,k);})||typeof params.mapId!=='string'||!/^\d{1,32}$/.test(params.mapId)||typeof params.type!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(params.type)||method==='resourcePage'&&(!Number.isInteger(params.pageIndex)||params.pageIndex<1||params.pageIndex>100))throw new Error('Invalid typed resource metadata query');
        var catalog=await window.__codexNativeSceneActions.execute('staticTypes',{mapId:params.mapId});
        var entries=catalog.types.filter(function(t){return t.VariableKey===params.type;});
        var expectedQuery={resourceMenu:'GetTypeMenu',resourceList:'SingleQuery',resourcePage:'PaginatedQuery'}[method];
        if(entries.length!==1||entries[0].DynamicQueryType!==expectedQuery)throw new Error('Requested resource query is not declared by current native metadata');
        if(metadataSequence>=2147483647)throw new Error('Metadata sequence exhausted');
        var seq=++metadataSequence,data={type:params.type};if(method==='resourcePage')data.pageIndex=params.pageIndex;
        var result=await call(method==='resourceMenu'?'GetTypeMenu':'GetTypeData',{seqId:seq,data:data});
        var items=method==='resourceMenu'?result.data?.menus:result.data?.list;
        if(result.seqId!==seq||result.data?.type!==params.type||!Array.isArray(items)||items.length>20000)throw new Error('Resource metadata callback differs from requested type/sequence');
        var identity=await call('GetAllActorCount',{});if(identity.mapID!==params.mapId)throw new Error('Selected map changed during resource query');
        return {mapId:params.mapId,readOnly:true,type:params.type,queryType:expectedQuery,pageIndex:params.pageIndex,items:items,hasMore:result.data.hasMore};
      }
      if (method === 'staticTypes') {
        if (!params || Object.keys(params).length !== 1 || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId)) throw new Error('Exact map ID required for static type metadata');
        var initial = await call('GetAllActorCount', {});
        if (initial.mapID !== params.mapId) throw new Error('Selected map differs from metadata query');
        if (metadataSequence >= 2147483647) throw new Error('Metadata sequence exhausted');
        var sequence = ++metadataSequence;
        var metadata = await call('GetTypeData', { seqId: sequence, data: { type: 'AllStatic' } });
        if (metadata.seqId !== sequence || metadata.data?.type !== 'AllStatic' || !Array.isArray(metadata.data.list) || metadata.data.list.length > 20000) throw new Error('Static metadata callback differs from requested type/sequence');
        var finalIdentity = await call('GetAllActorCount', {});
        if (finalIdentity.mapID !== params.mapId) throw new Error('Selected map changed during metadata query');
        return { mapId: params.mapId, readOnly: true, types: metadata.data.list };
      }
      if (method === 'resourceReferences') {
        if (!params || Object.keys(params).length !== 3 || !['Widget', 'Element', 'LogicElement', 'Module'].includes(params.kind) || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId) || !Array.isArray(params.ids) || params.ids.length < 1 || params.ids.length > 30 || params.ids.some(function (id) { return typeof id !== 'string' || !/^\d{1,32}$/.test(id); }) || new Set(params.ids).size !== params.ids.length) throw new Error('Invalid typed resource reference query');
        var before = await call('GetAllActorCount', {});
        if (before.mapID !== params.mapId) throw new Error('Selected map differs from resource query');
        var response = await call('GetReferenceElementInfoReq', { checkedAssets: [{ blocklyFileId: '', triggerGroupId: '', blockId: '', assetKey: 'AI_TYPED_RESOURCE_READ', elements: [{ types: [params.kind], sceneIds: params.ids, multiSelect: params.ids.length > 1 }] }] });
        var after = await call('GetAllActorCount', {});
        if (after.mapID !== params.mapId) throw new Error('Selected map changed during resource query');
        return { mapId: params.mapId, kind: params.kind, requestedIds: params.ids, reference: response };
      }
      if (method !== 'sceneReferences') throw new Error('Unsupported scene query');
      if (!params || Object.keys(params).length !== 2 || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId) || !Array.isArray(params.sceneIds) || params.sceneIds.length < 1 || params.sceneIds.length > 30 || params.sceneIds.some(function (id) { return typeof id !== 'string' || !/^\d{1,32}$/.test(id); })) throw new Error('Invalid scene reference query');
      var count = await call('GetAllActorCount', {});
      if (String(count.mapID) !== params.mapId) throw new Error('Selected map differs from scene query');
      var reference = await call('GetReferenceElementInfoReq', {
        checkedAssets: [{
          blocklyFileId: '', triggerGroupId: '', blockId: '', assetKey: 'AI_NATIVE_SCENE_READ',
          elements: [{ types: ['Element'], sceneIds: params.sceneIds, multiSelect: params.sceneIds.length > 1 }],
        }],
      });
      return { mapId: params.mapId, actorCount: count.count, requestedIds: params.sceneIds, reference: reference, note: 'Reference metadata is not a full scene graph or a persistent editing interface.' };
    },
  };
})();
