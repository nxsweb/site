/* 프리셋 파일 입출력 · 백업 · 최신화 검토
 * preset.js와 같은 전역 스크립트 범위에서 실행하며 앱 초기화 전에 모두 로드한다.
 */
/* ── 01 · 가져오기·백업 ── */
function makeTraitPresetFileName(customName=''){
  const cleaned=cleanTraitPresetFileBaseName(customName);
  if(cleaned) return `${cleaned}.txt`;
  return `${traitPresetBackupDefaultFileName()}.txt`;
}
// 백업·최신화 화면의 이름만 한글로 표시한다. 파일 저장 키/스키마는 변경하지 않는다.
const TRAIT_PRESET_RETIRED_VALUE_NAMES=Object.freeze({
  additionalInputMode:'에디셔널 · 입력 방식',
  additionalManualValues:'에디셔널 · 수동 입력 보관',
  additionalRuneModEnabled:'에디셔널 · 개조 적용 선택',
  addAD:'에디셔널 · 수동 공격력',
  addAS:'에디셔널 · 수동 공격속도',
  addCD:'에디셔널 · 수동 크리 데미지',
  addCRI:'에디셔널 · 수동 크리 확률',
  addAP:'에디셔널 · 수동 마법공격력',
  addTD:'에디셔널 · 수동 총 데미지',
  addUA:'에디셔널 · 수동 유닛 가속'
});
const TRAIT_PRESET_RETIRED_STRUCTURE_NAMES=Object.freeze({
  type:'파일 종류',webDpsVersion:'웹 버전',presetManagement:'관리 버전',exportedAt:'내보낸 날짜',
  presets:'프리셋 목록',jewelSettings:'쥬얼 설정',unitBoard:'유닛 보드',
  id:'프리셋 식별 정보',name:'프리셋 이름',createdAt:'생성 날짜',updatedAt:'수정 날짜',
  meta:'프리셋 분류 정보',state:'저장 상태',savedAt:'저장 날짜',
  values:'설정값',inv:'특성 투자',zeroScore:'승단 계산',
  visibleSlotCount:'표시 슬롯 수',units:'유닛 구성',slotExpansions:'슬롯 확장',
  additionalUnitSettings:'추가 유닛 설정',sanctuaryInfo:'성소 정보',
  legendaryMythicJewels:'전설·신화 쥬얼'
});
function traitPresetRetiredValueName(id){
  if(hasOwn(REMOVED_PRESET_VALUE_LABELS,id)) return `이달의 룬 효과 · ${REMOVED_PRESET_VALUE_LABELS[id]}`;
  if(hasOwn(TRAIT_PRESET_RETIRED_VALUE_NAMES,id)) return TRAIT_PRESET_RETIRED_VALUE_NAMES[id];
  const field=FIELD_REGISTRY[id];
  if(field) return `${field.kind} · ${field.name}`;
  return '기타 이전 설정';
}
function traitPresetBackupStructureName(id){
  return TRAIT_PRESET_RETIRED_STRUCTURE_NAMES[String(id || '')] || '기타 이전 저장 정보';
}
function traitPresetChangeKeyLabel(key){
  const normalized=String(key || '');
  if(normalized==='sanctuaryInfo:init') return '성소 정보 · 신규 항목';
  if(normalized==='sanctuaryInfo:slotCount') return '성소 정보 · 슬롯 수';
  const sanctuary=normalized.match(/^sanctuaryInfo:(\d+):(range|skill1|count1|skill2|count2)$/);
  if(sanctuary){
    const label={range:'적용 라운드·층',skill1:'1번 스킬',count1:'1번 사용 횟수',skill2:'2번 스킬',count2:'2번 사용 횟수'}[sanctuary[2]];
    return `성소 정보 ${String(Number(sanctuary[1])+1).padStart(2,'0')}번 · ${label}`;
  }
  if(normalized.startsWith('value:')){
    const id=normalized.slice(6);
    if(id==='gameMode') return '게임 모드';
    const field=FIELD_REGISTRY[id];
    if(hasOwn(TRAIT_PRESET_RETIRED_VALUE_NAMES,id)) return TRAIT_PRESET_RETIRED_VALUE_NAMES[id];
    if(field?.kind==='에디셔널') return `에디셔널 · ${field.name}`;
    if(field?.kind==='인첸트 레벨 / 결과') return '룬 인첸트 레벨';
    if(field?.kind==='룬정보' && /^(rAD|rAS|rCRI|rCD)$/.test(id)) return `룬 ${field.name}`;
    if(field?.kind==='룬정보') return `룬 · ${field.name}`;
    if(field?.kind==='특성 투자 제한') return `특성 투자 제한 ${field.name}`;
    return TRAIT_PRESET_CHANGE_LABEL_OVERRIDES[id] || field?.name || '기타 설정';
  }
  if(normalized.startsWith('obsolete:')){
    const [,scope,...rest]=normalized.split(':');
    const id=rest.join(':');
    if(scope==='value') return `폐지된 설정 · ${traitPresetRetiredValueName(id)}`;
    if(scope==='root') return `폐지된 공통 항목 · ${traitPresetBackupStructureName(id)}`;
    if(scope==='preset') return `폐지된 프리셋 항목 · ${traitPresetBackupStructureName(id)}`;
    if(scope==='state') return `폐지된 상태 항목 · ${traitPresetBackupStructureName(id)}`;
    if(scope==='inv') return '특성 투자 · 폐지된 투자 항목';
    if(scope==='unitBoard' || scope==='board') return `유닛 보드 · 폐지된 ${traitPresetBackupStructureName(id.split(/[.\[]/)[0])}`;
    if(scope==='jewel') return `쥬얼 설정 · 폐지된 ${traitPresetBackupStructureName(id)}`;
    if(scope==='board-link') return '유닛 보드 · 사용하지 않는 프리셋 연결';
    return '폐지된 저장 항목';
  }
  if(normalized.startsWith('schema:value:')) return traitPresetImportReadableName(normalized.slice('schema:value:'.length));
  if(normalized==='schema:visibleSlotCount') return '유닛 보드 · 표시 슬롯 수';
  if(normalized==='schema:sanctuaryInfo') return '유닛 보드 · 성소 정보 형식';
  if(normalized.startsWith('schema:board:')) return `유닛 보드 · ${traitPresetBackupStructureName(normalized.slice('schema:board:'.length).split(/[.\[]/)[0])} 형식`;
  if(normalized.startsWith('import:')) return traitPresetImportIssueChange(normalized.slice(7)).label;
  if(normalized.startsWith('inv:')){
    const row=normalized.slice(4);
    const trait=TRAITS.find(item=>String(item[0])===row);
    if(trait?.[0]===116) return '나눔 설정';
    if(trait?.[0]===SP_BANK_TRAIT_ROW) return 'SP 은행 투자';
    if(trait?.[1]==='심연 내성' && trait?.[2]==='심연특성') return '심연 특성 심연 내성';
    if(trait?.[1]==='등급재설정 보정') return `${trait[2]} ${trait[1]}`;
    return trait?.[1] || '특성 투자';
  }
  return ({
    zeroScore:'승단 계산',
    unitBoard:'유닛 보드',
    jewelSettings:'쥬얼 설정',
    presetName:'프리셋 이름',
    storedPreset:'프리셋 저장 내용',
    importShared:'이전 가져오기 공통 항목 정리',
    importRepair:'누락된 프리셋 설정 보완',
    donationMigration:'나눔 저장 방식',
    'state:shared':'전체 프리셋 대상',
    'state:single':'현재 프리셋 대상'
  })[normalized] || (normalized.startsWith('unitBoard:') ? '유닛 보드 · 설정 변경' :
    normalized.startsWith('jewelSettings:') ? '쥬얼 설정 · 항목 변경' :
    normalized.startsWith('zeroScore:') ? '승단 계산 · 항목 변경' : '기타 설정 변경');
}
function traitPresetBackupDisplayLabel(key,existingLabel=''){
  const normalized=String(key || '');
  // 과거 변경 기록에 영문 항목명이 저장되어 있어도 현재 표기 규칙을 우선한다.
  if(normalized.startsWith('obsolete:') || normalized.startsWith('schema:') ||
    normalized.startsWith('import:') || normalized.startsWith('value:') || normalized.startsWith('inv:'))
    return traitPresetChangeKeyLabel(normalized);
  return existingLabel || traitPresetChangeKeyLabel(normalized);
}
function traitPresetBackupDisplayValue(key,value){
  const text=String(value ?? '');
  if(text==='sld_dps_total_preset') return '통합 프리셋 파일';
  if(text==='ON/OFF') return '개인전';
  if(text==='OFF/ON') return '협동전';
  const fixed={ON:'사용',OFF:'미사용','ON+':'강화 적용',none:'선택 안함',normal:'일반',
    artifact:'유물',tower:'도전의 탑',planet:'행성탐사',harmony:'하모니룬',
    cosmos:'코스모스룬',chaos:'카오스룬',final:'파이널룬',winners:'위너스룬'};
  if(hasOwn(fixed,text)) return fixed[text];
  if(key.startsWith('value:')){
    const el=$(key.slice(6));
    if(el?.tagName==='SELECT'){
      const option=[...el.options].find(item=>item.value===text);
      if(option && option.textContent.trim()!==text) return option.textContent.trim();
    }
  }
  if((text.startsWith('{') || text.startsWith('[')) && safeJsonParse(text)!==null) return '세부 설정 데이터';
  return text;
}
function traitPresetBackupPresetRows(store,commonScopeIds,singleScopeIds){
  const presets=Array.isArray(store?.presets) ? store.presets : [];
  const idToPreset=new Map(presets.map(preset=>[String(preset.id || ''),preset]).filter(([id])=>id));
  const orderedIds=[];
  const seenIds=new Set();
  const appendPresetId=preset=>{
    const id=String(preset?.id || '');
    if(id && !seenIds.has(id)){
      seenIds.add(id);
      orderedIds.push(id);
    }
  };
  const buckets=sortedTraitPresetBuckets(store);
  TRAIT_PRESET_SELECT_GROUPS.forEach(group=>{
    (buckets[group.key] || []).forEach(appendPresetId);
  });
  presets.forEach(appendPresetId);
  return orderedIds.map(id=>{
    const preset=idToPreset.get(id);
    const common=commonScopeIds.has(id);
    const single=singleScopeIds.has(id);
    return {id,name:normalizeTraitPresetName(preset?.name || '프리셋'),common,single,changed:common || single};
  });
}
function traitPresetBackupChangePlan(store=loadTraitPresetStore(),currentSnapshot=null,options={}){
  const status=options.currentOnly ? emptyTraitPresetStatusData() : loadTraitPresetStatusData();
  const appliedId=loadTraitPresetStatusData().selectedTraitPresetId;
  const selectedId=appliedId && selectedTraitPresetId()===appliedId ? appliedId : '';
  const selectedPreset=store.presets.find(preset=>preset.id===selectedId) || null;
  const validIds=new Set((store?.presets || []).map(preset=>String(preset.id || '')).filter(Boolean));
  const storedUpdatedIds=new Set(status.updatedPresetIds.filter(id=>validIds.has(id)));
  const legacyImportMarkers=status.lastAction==='import' && !status.pendingCommonChangeKeys.length &&
    Object.values(status.pendingSingleChangeKeysByPreset).every(keys=>keys.length===1 && keys[0]==='storedPreset');
  const unclassifiedImport=legacyImportMarkers && status.updatedPresetIds.length>0;
  const storedUnitBoardIds=new Set(status.pendingUnitBoardPresetIds.filter(id=>validIds.has(id)));
  const commonScopeIds=new Set(status.pendingCommonPresetIds.filter(id=>validIds.has(id)));
  const singleScopeIds=new Set();
  const commonChangeKeys=new Set(status.pendingCommonChangeKeys || []);
  const singleChangeKeysByPreset=new Map();
  let pendingChangeDetails=status.pendingChangeDetails;
  const addSingleKeys=(id,keys)=>{
    const presetId=String(id || '').trim();
    if(!validIds.has(presetId)) return;
    if(!singleChangeKeysByPreset.has(presetId)) singleChangeKeysByPreset.set(presetId,new Set());
    keys.forEach(key=>singleChangeKeysByPreset.get(presetId).add(key));
    singleScopeIds.add(presetId);
  };
  Object.entries(status.pendingSingleChangeKeysByPreset).forEach(([id,keys])=>{
    if(legacyImportMarkers && keys.every(key=>key==='storedPreset')) return;
    addSingleKeys(id,keys);
  });
  if(commonChangeKeys.size && !commonScopeIds.size){
    store.presets.forEach(preset=>commonScopeIds.add(preset.id));
  }
  if(legacyImportMarkers) storedUpdatedIds.clear();
  storedUpdatedIds.forEach(id=>{
    if(!commonScopeIds.has(id) && !singleScopeIds.has(id)) addSingleKeys(id,['storedPreset']);
  });
  storedUnitBoardIds.forEach(id=>addSingleKeys(id,['unitBoard']));
  const details=()=>{
    const commonDetails=pendingChangeDetails.filter(row=>row.scope==='common');
    if(commonDetails.length){
      if(commonChangeKeys.has('state:shared')) commonChangeKeys.delete('state:shared');
      commonDetails.forEach(row=>commonChangeKeys.add(row.key));
      store.presets.forEach(preset=>commonScopeIds.add(preset.id));
    }
    const singleDetails=pendingChangeDetails.filter(row=>row.scope==='single' && validIds.has(row.presetId));
    singleDetails.forEach(row=>{
      const existing=singleChangeKeysByPreset.get(row.presetId);
      if(existing?.has('storedPreset')) existing.delete('storedPreset');
      addSingleKeys(row.presetId,[row.key]);
    });
    const presetRows=traitPresetBackupPresetRows(store,commonScopeIds,singleScopeIds);
    const singleChangesByPreset=presetRows.filter(row=>row.single).map(row=>({
      ...row,keys:[...(singleChangeKeysByPreset.get(row.id) || new Set(['storedPreset']))]
    }));
    return {presetRows,singleChangesByPreset,unclassifiedImport,commonChangeKeys:[...commonChangeKeys],pendingChangeDetails};
  };
  const hasStoredPending=status.backupNeeded || storedUpdatedIds.size>0 || storedUnitBoardIds.size>0;
  if(!selectedPreset || options.migrationOnly){
    return {store,selectedId:'',selectedPreset:null,...details(),hasCurrentPending:false,hasStoredPending,hasDraftPending:false,hasPending:hasStoredPending};
  }
  const now=Date.now();
  const currentState=markPresetStateCurrentVersion({...((currentSnapshot && typeof currentSnapshot==='object') ? currentSnapshot : makeStateObject()),savedAt:now});
  const currentUnitBoard=captureTraitPresetUnitBoardState();
  const currentJewelSettings=captureTraitPresetJewelSettings();
  const stateChangeSummary=traitPresetStateChangeSummary(selectedPreset.state,currentState);
  stateChangeSummary.sharedKeys.forEach(key=>commonChangeKeys.add(key));
  if(stateChangeSummary.sharedChanged) store.presets.forEach(preset=>commonScopeIds.add(preset.id));
  if(stateChangeSummary.singleKeys.size) addSingleKeys(selectedId,stateChangeSummary.singleKeys);
  const unitBoardChanges=traitPresetUnitBoardChangeKeys(traitPresetUnitBoardState(store,selectedId),currentUnitBoard);
  const unitBoardChanged=!traitPresetHasUnitBoard(store,selectedId) || unitBoardChanges.length>0;
  if(unitBoardChanged) addSingleKeys(selectedId,unitBoardChanges.length ? unitBoardChanges : ['unitBoard']);
  const jewelChanged=traitPresetJewelSettingsChanged(store);
  if(jewelChanged){
    commonChangeKeys.add('jewelSettings');
    store.presets.forEach(preset=>commonScopeIds.add(preset.id));
  }
  let hasDraftPending=false;
  Object.entries(options.currentOnly ? {} : loadTraitPresetDrafts()).forEach(([id,draft])=>{
    if(!validIds.has(id) || id===selectedId) return;
    const preset=store.presets.find(item=>item.id===id);
    const state=normalizeTraitPresetState(draft?.state);
    if(!preset || !state) return;
    const summary=traitPresetStateChangeSummary(preset.state,state);
    summary.sharedKeys.forEach(key=>commonChangeKeys.add(key));
    if(summary.sharedChanged){ store.presets.forEach(item=>commonScopeIds.add(item.id)); hasDraftPending=true; }
    if(summary.singleKeys.size){ addSingleKeys(id,summary.singleKeys); hasDraftPending=true; }
    const draftBoardChanges=draft.unitBoard ? traitPresetUnitBoardChangeKeys(traitPresetUnitBoardState(store,id),draft.unitBoard) : [];
    if(draftBoardChanges.length){
      addSingleKeys(id,draftBoardChanges);
      hasDraftPending=true;
    }
  });
  const previewStore=JSON.parse(JSON.stringify(store));
  if(stateChangeSummary.stateChanged){
    previewStore.presets=previewStore.presets.map(item=>item.id===selectedId ? {...item,state:currentState} :
      stateChangeSummary.sharedChanged ? {...item,state:buildSyncedTraitPresetState(currentState,item.state,stateChangeSummary.sharedKeys)} : item);
  }
  if(unitBoardChanged){
    if(!previewStore.unitBoard) previewStore.unitBoard={presets:{}};
    if(!previewStore.unitBoard.presets) previewStore.unitBoard.presets={};
    previewStore.unitBoard.presets[selectedId]=currentUnitBoard;
  }
  if(jewelChanged) previewStore.jewelSettings=currentJewelSettings;
  if(!options.currentOnly) applyTraitPresetDraftsToStore(previewStore,store,selectedId,currentState,stateChangeSummary.sharedKeys);
  previewStore.presets.forEach(item=>{
    const original=store.presets.find(row=>row.id===item.id);
    if(original && (jewelChanged || stableTraitPresetValue(original.state)!==stableTraitPresetValue(item.state) || stableTraitPresetValue(store.unitBoard?.presets?.[item.id])!==stableTraitPresetValue(previewStore.unitBoard?.presets?.[item.id]))){
      item.updatedAt=now;item.meta=traitPresetMetaFromSavedState(item.state);
    }
  });
  pendingChangeDetails=mergeTraitPresetChangeDetails(pendingChangeDetails,traitPresetChangeDetailsForStores(store,previewStore));
  const hasCurrentPending=stateChangeSummary.stateChanged || unitBoardChanged || jewelChanged;
  return {
    store,previewStore,selectedId,selectedPreset,currentState,currentUnitBoard,currentJewelSettings,
    ...details(),hasCurrentPending,hasStoredPending,hasDraftPending,
    hasPending:hasCurrentPending || hasStoredPending || hasDraftPending
  };
}
function traitPresetReadableStoredChange(key,value){
  const text=String(value ?? '');
  if(key==='value:additionalRuneSlots' && text.trim().startsWith('[')) return traitPresetChangeValueText(key,text);
  return text;
}
function traitPresetBackupChangeListHtml(keys,details=[],presetId=''){
  if(!keys.length) return '<p class="trait-preset-backup-no-change">업데이트 없음</p>';
  const scopedDetails=details.filter(row=>!row.scope || (presetId ? row.scope==='single' && row.presetId===presetId : row.scope==='common'));
  const filteredKeys=keys.filter(key=>!['unitBoard','jewelSettings','zeroScore'].some(group=>
    key===group && scopedDetails.some(row=>row.key.startsWith(group+':'))));
  const rows=filteredKeys.map(key=>{
    const item=scopedDetails.find(row=>row.key===key);
    const label=traitPresetBackupDisplayLabel(key,item?.label);
    if(!item || (key==='unitBoard' && item.before==='이전 보드' && item.after==='변경된 보드'))
      return `<li><strong>${escapeHtml(label)}</strong><span class="trait-preset-backup-values">과거 변경 기록에 세부 값이 저장되지 않았습니다.</span></li>`;
    const before=traitPresetBackupDisplayValue(key,traitPresetReadableStoredChange(key,item.before));
    const after=traitPresetBackupDisplayValue(key,traitPresetReadableStoredChange(key,item.after));
    const variation=traitPresetChangeVariation(before,after,key);
    return `<li${key.startsWith('obsolete:')?' class="is-removed"':''}><strong>${escapeHtml(label)}</strong><span class="trait-preset-backup-values"><span>${escapeHtml(traitPresetChangeNumberText(before,key))}</span><b aria-label="변경 후">→</b><span>${escapeHtml(traitPresetChangeNumberText(after,key))}</span><em>${escapeHtml(variation)}</em></span></li>`;
  });
  return rows.length ? `<ul class="trait-preset-backup-change-list">${rows.join('')}</ul>` : '<p class="trait-preset-backup-no-change">업데이트 없음</p>';
}
function traitPresetReviewStats(items){
  return `<div class="trait-preset-review-stats" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${items.map(([count,label,style=''])=>`<div class="${style}"><strong>${count}</strong><span>${label}</span></div>`).join('')}</div>`;
}
function traitPresetBackupTargetsHtml(plan){
  if(plan.mode==='import'){
    const recovery=plan.recovery;
    const common=[...recovery.sharedChanges,...recovery.commonChanges];
    const commonHtml=common.length ? `<section class="trait-preset-backup-common"><h4>모든 프리셋에 적용 <span>수정 ${common.length}건</span></h4><p>전체 프리셋에 동일하게 반영되는 설정</p>${traitPresetBackupChangeListHtml(common.map(change=>change.key),common)}</section>` : '';
    const rows=recovery.rows.map(row=>{
      const changes=row.individualChanges || [];
      // 변경사항과 오류가 있는 프리셋만 상세 목록에 표시한다.
      if(!row.error && !changes.length) return '';
      const content=row.error ? `<p class="trait-preset-backup-invalid">${escapeHtml(row.error)}</p>` :
        traitPresetBackupChangeListHtml(changes.map(change=>change.key),changes,row.raw?.id);
      return `<article class="trait-preset-backup-card"><header class="trait-preset-backup-card-head"><div class="trait-preset-backup-card-identity"><span>${row.index+1}번째</span><h3>${escapeHtml(row.name)}</h3></div></header><div class="trait-preset-backup-card-changes"><section class="trait-preset-backup-scope is-individual${row.error?' is-error':''}"><h4>${row.error?'오류':`수정 ${changes.length}건`}</h4>${content}</section></div></article>`;
    }).filter(Boolean).join('');
    const candidates=recovery.rows.filter(row=>row.candidate);
    const conflicting=candidates.length>1 && new Set(candidates.map(row=>traitPresetSharedStateSignature(row.candidate.presets[0].state))).size>1;
    const choice=conflicting ? `<label class="trait-preset-backup-source"><span>모든 프리셋에 적용할 기준 선택</span><select id="traitPresetImportSharedSource"><option value="">기준 프리셋 선택</option>${candidates.map(row=>`<option value="${row.index}">${escapeHtml(row.name)} (${row.index+1}번째)</option>`).join('')}</select></label>` : '';
    const error=recovery.sharedError ? `<p class="trait-preset-backup-invalid">${escapeHtml(recovery.sharedError)}</p>` : '';
    const invalid=recovery.rows.filter(row=>row.error).length;
    const repair=recovery.rows.filter(row=>!row.error && (common.length || conflicting || row.individualChanges?.length)).length;
    return `<section class="trait-preset-backup-targets"><header class="trait-preset-backup-list-head"><h3>${escapeHtml(recovery.fileName)}</h3><span>전체 ${recovery.rows.length}개</span></header>
      ${traitPresetReviewStats([[recovery.rows.length-invalid-repair,'변경 없음'],[repair,'최신화 대상','is-warn'],[invalid,'데이터 오류','is-error']])}
      ${error}${choice}<h4 class="trait-preset-preview-heading">변경사항 미리보기</h4>${commonHtml}${conflicting?'<div id="traitPresetImportSyncPreview" class="trait-preset-backup-common"><p>기준 프리셋을 선택하면 달라지는 설정을 확인할 수 있습니다.</p></div>':''}${rows ? `<h4 class="trait-preset-preview-heading is-individual">프리셋별 적용</h4><div class="trait-preset-backup-cards">${rows}</div>` : ''}</section>`;
  }
  const rows=Array.isArray(plan?.presetRows) ? plan.presetRows : [];
  const updatedRows=rows.filter(row=>row.changed);
  const singleChanges=new Map((plan.singleChangesByPreset || []).map(row=>[row.id,row.keys]));
  const details=plan.pendingChangeDetails || [];
  const migration=plan.migration;
  const migrationCommon=migration?.common || [];
  const commonKeys=[...new Set([...(plan.commonChangeKeys || []),...migrationCommon.map(change=>change.key)])];
  const allDetails=[...details,...migrationCommon.map(change=>({...traitPresetChangeDetail(change.key,change.before,change.after,'common'),label:change.label}))];
  const visibleCommonKeys=commonKeys.filter(key=>!['jewelSettings','zeroScore'].some(group=>key===group && allDetails.some(row=>row.scope==='common' && row.key.startsWith(group+':'))));
  const commonSummary=visibleCommonKeys.length ? `<section class="trait-preset-backup-common"><h4>모든 프리셋에 적용 <span>수정 ${visibleCommonKeys.length}건</span></h4><p>전체 프리셋에 동일하게 반영되는 설정</p>
    ${traitPresetBackupChangeListHtml(visibleCommonKeys,allDetails)}</section>` : '';
  const cards=rows.map((row,index)=>{
    const migrationChanges=migration?.byPreset?.get(row.id) || [];
    const pendingKeys=singleChanges.get(row.id) || [];
    const keys=[...new Set([...pendingKeys,...migrationChanges.map(change=>change.key)])].filter(key=>
      key!=='unitBoard' || !allDetails.some(item=>item.scope==='single' && item.presetId===row.id && item.key.startsWith('unitBoard:')));
    if(!keys.length) return '';
    const preset=plan.store.presets.find(item=>item.id===row.id);
    const group=TRAIT_PRESET_SELECT_GROUPS.find(item=>item.key===traitPresetCategoryKey(preset));
    const mode=group?.label || '개인전';
    const individualDetails=[...allDetails,...migrationChanges.map(change=>({...traitPresetChangeDetail(change.key,change.before,change.after,'single',row.id),label:change.label}))];
    return `<article class="trait-preset-backup-card"><header class="trait-preset-backup-card-head">
      <div class="trait-preset-backup-card-identity"><span>${mode} · ${index+1}번째</span><h3>${escapeHtml(row.name)}</h3></div></header>
      <div class="trait-preset-backup-card-changes"><section class="trait-preset-backup-scope is-individual"><h4>수정 ${keys.length}건</h4>
      ${traitPresetBackupChangeListHtml(keys,individualDetails,row.id)}</section></div></article>`;
  }).filter(Boolean).join('');
  const changedIds=new Set([...updatedRows.map(row=>row.id),...[...(migration?.byPreset?.keys() || [])]]);
  if(visibleCommonKeys.length) rows.forEach(row=>changedIds.add(row.id));
  const empty='<p class="trait-preset-backup-no-change">변경사항 없음</p>';
  const singleLabel=plan.mode==='update'?'현재 프리셋에 적용':'프리셋별 적용';
  const singleHtml=cards?`<h4 class="trait-preset-preview-heading is-individual">${singleLabel}</h4><div class="trait-preset-backup-cards">${cards}</div>`:'';
  if(plan.mode==='update') return `<section class="trait-preset-backup-targets"><header class="trait-preset-backup-list-head"><h3>${escapeHtml(plan.selectedPreset?.name || '')}</h3></header>${traitPresetReviewStats([[visibleCommonKeys.length,'모든 프리셋에 적용','is-warn'],[(singleChanges.get(plan.selectedId)||[]).length,'현재 프리셋에 적용']])}<h4 class="trait-preset-preview-heading">변경사항 미리보기</h4>${commonSummary}${singleHtml}${!commonSummary&&!singleHtml?empty:''}</section>`;
  return `<section class="trait-preset-backup-targets">${traitPresetReviewStats([[rows.length,'전체 프리셋'],[changedIds.size,'최신화 대상','is-warn'],[0,'데이터 오류']])}<h4 class="trait-preset-preview-heading">변경사항 미리보기</h4>${plan.unclassifiedImport?'<p class="trait-preset-backup-included">이전 변경 기록은 상세 구분할 수 없습니다.</p>':''}${commonSummary}${singleHtml}${!commonSummary&&!singleHtml?empty:''}</section>`;

}
let traitPresetBackupPanelPlan=null;
let traitPresetImportPending=false;
let traitPresetBackupLocked=false;
let traitPresetBackupPreviousFocus=null;
function setTraitPresetBackupSavingState(active){
  traitPresetBackupLocked=!!active;
  qsa('[data-trait-preset-backup-run]').forEach(btn=>{btn.disabled=!!active;});
  qsa('[data-trait-preset-backup-close]').forEach(btn=>{ btn.disabled=!!active; });
}
function traitPresetBackupDefaultFileName(){
  return `NXS_${formatTraitPresetExportedAt().slice(0,11)}`;
}
function traitPresetBackupFileNameControlHtml(plan){
  const fileNeeded=plan.mode==='backup' || (plan.mode==='import' && plan.recovery.needsReview);
  const action=plan.mode==='update'?'업데이트':plan.mode==='import'?(fileNeeded?'최신화 후 가져오기·백업':'가져오기'):(plan.migration || plan.hasPending?'최신화 및 백업':'백업하기');
  const notice=plan.mode==='import'?(fileNeeded?'최신화된 프리셋을 가져오고 백업 파일을 생성합니다.':'프리셋을 가져옵니다.'):(plan.mode==='backup'?'전체 프리셋을 최신 상태로 정리하고 백업 파일을 생성합니다.':'');
  const replacement=plan.mode==='import' && plan.existingCount>0 ? `기존에 저장된 프리셋 ${plan.existingCount}개는 가져온 데이터로 교체됩니다.` : '';
  return `<section class="trait-preset-backup-file-box">
    ${notice?`<div class="trait-preset-backup-notices"><p class="trait-preset-backup-included">${notice}</p>${replacement?`<p class="trait-preset-backup-included">${replacement}</p>`:''}</div>`:''}
    ${fileNeeded?`<label class="trait-preset-modal-field"><span>백업 파일명</span><input id="traitPresetBackupName" type="text" maxlength="80" autocomplete="off" placeholder="파일명을 입력하세요" value="${escapeHtml(traitPresetBackupDefaultFileName())}"/></label>`:''}
    <div class="trait-preset-backup-actions"><button class="btn is-cancel ui-action-btn" type="button" data-trait-preset-backup-close="1">취소</button><button class="btn pri ui-action-btn" type="button" data-trait-preset-backup-run="apply" ${plan.mode==='import' && (plan.recovery.sharedError || plan.recovery.rows.some(row=>row.error)) ? 'disabled' : ''}>${action}</button></div>
  </section>`;
}
function renderTraitPresetBackupPanel(plan){
  const body=$('traitPresetBackupBody');
  if(!body) return;
  const panel=body.closest('.trait-preset-backup-panel');
  if(panel){
    panel.classList.toggle('has-pending-change',!!plan.hasPending);
  }
  $('traitPresetBackupTitle').textContent=plan.mode==='import'?'프리셋 최신화':plan.mode==='update'?'프리셋 업데이트':'프리셋 최신화';
  body.innerHTML=`
    ${traitPresetBackupTargetsHtml(plan)}
    ${traitPresetBackupFileNameControlHtml(plan)}`;
  if(plan.mode==='import'){
    const select=$('traitPresetImportSharedSource');
    if(select){
      const update=()=>{
        const run=body.querySelector('[data-trait-preset-backup-run]');
        const preview=$('traitPresetImportSyncPreview');
        const blocked=!!plan.recovery.sharedError || plan.recovery.rows.some(row=>row.error) || !select.value || traitPresetBackupLocked;
        if(run) run.disabled=blocked;
        if(!preview) return;
        if(blocked){preview.innerHTML='<p>기준 프리셋을 선택하면 달라지는 설정을 확인할 수 있습니다.</p>';return;}
        try{
          const source=plan.recovery.rows.find(row=>String(row.index)===select.value);
          const base=source.candidate.presets[0].state;
          const keys=traitPresetSharedStateKeys(base);
          const changed=plan.recovery.rows.map(row=>{
            const before=row.candidate.presets[0].state;
            const after=buildSyncedTraitPresetState(base,before,keys);
            const item=row.candidate.presets[0];
            const changes=traitPresetChangeDetailsForStores({presets:[item],unitBoard:row.candidate.unitBoard,jewelSettings:row.candidate.jewelSettings},{presets:[{...item,state:after}],unitBoard:row.candidate.unitBoard,jewelSettings:row.candidate.jewelSettings}).filter(change=>change.scope==='common');
            return changes.length?`<h4>${escapeHtml(row.name)}</h4>${traitPresetBackupChangeListHtml(changes.map(item=>item.key),changes)}`:'';
          }).join('');
          preview.innerHTML=`<h4>기준 설정에 맞춰 변경되는 값</h4>${changed || '<p>변경사항 없음</p>'}`;
        }catch(error){preview.textContent='변경값을 확인할 수 없습니다. '+error.message;if(run) run.disabled=true;}
      };
      select.addEventListener('change',update);
      update();
    }
  }
  body.scrollTop=0;

}
function renderTraitPresetOperationError(operation,error){
  traitPresetBackupPanelPlan=null;
  $('traitPresetBackupTitle').textContent=`프리셋 ${operation}`;
  renderTraitPresetBackupError(error);
  $('traitPresetBackupOverlay').hidden=false;
  $('traitPresetBackupPanel').classList.add('is-open');
  DPS_BODY.classList.add('trait-preset-backup-open');
  traitPresetBackupPreviousFocus=document.activeElement;
  $('traitPresetBackupPanel').focus({preventScroll:true});
}
function renderTraitPresetBackupError(error=''){
  const body=$('traitPresetBackupBody');
  if(!body) return;
  body.closest('.trait-preset-backup-panel')?.classList.remove('has-pending-change');
  body.innerHTML=`<section class="trait-preset-backup-error"><h3>프리셋 작업을 완료하지 못했습니다.</h3><p>${escapeHtml(error)}</p><button type="button" class="trait-preset-support" data-trait-preset-error-copy>오류 정보 복사</button></section><div class="trait-preset-backup-file-box"><div class="trait-preset-backup-actions is-single-action"><button class="btn is-cancel ui-action-btn" type="button" data-trait-preset-backup-close="1">닫기</button></div></div>`;
}
function notifyTraitPresetBackupFileComplete(fileName){
  const normalized=String(fileName || '').trim() || makeTraitPresetFileName('');
  showToast(`${normalized} 다운로드를 요청했습니다.`,'ok');
}
function showTraitPresetUnifiedPanel(plan){
  plan.reviewedStore=localStorage.getItem(TRAIT_PRESET_STORAGE_KEY);
  plan.reviewedDrafts=localStorage.getItem(TRAIT_PRESET_DRAFT_STORAGE_KEY);
  renderTraitPresetBackupPanel(plan);
  const panel=$('traitPresetBackupPanel');
  const overlay=$('traitPresetBackupOverlay');
  traitPresetBackupPreviousFocus=document.activeElement;
  if(overlay) overlay.hidden=false;
  if(panel) panel.classList.add('is-open');
  DPS_BODY.classList.add('trait-preset-backup-open');
  panel?.focus({preventScroll:true});
}
function openTraitPresetBackupPanel(){
  try{
    if(traitPresetBackupLocked || traitPresetImportPending || $('traitPresetBackupPanel')?.classList.contains('is-open')) return false;
    const compatibility=storedTraitPresetCompatibility();
    if(compatibility.error) throw new Error(compatibility.error);
    const currentSnapshot=makeStateObject();
    if(!isStorageLocked() && !compatibility.requiresUpdate) saveState({silent:true,state:currentSnapshot});
    const store=loadTraitPresetStore();
    if(!store.presets.length){ notifyStorageAction('백업할 프리셋이 없습니다.','err'); return false; }
    traitPresetBackupPanelPlan={...traitPresetBackupChangePlan(store,currentSnapshot,{migrationOnly:compatibility.requiresUpdate}),mode:'backup'};
    if(compatibility.requiresUpdate){
      const raw=safeJsonParse(localStorage.getItem(TRAIT_PRESET_STORAGE_KEY));
      traitPresetBackupPanelPlan.migration=traitPresetMigrationChanges(raw);
      traitPresetBackupPanelPlan.migrationStore=completeTraitPresetStoreSchema(raw);
      traitPresetBackupPanelPlan.hasPending=true;
    }
    if(!compatibility.requiresUpdate){
      const validation=inspectTraitPresetImportCompatibility(traitPresetBackupPanelPlan.previewStore || store);
      if(validation.requiresUpdate) throw new Error('최신화 계획의 데이터 형식을 확인해 주세요.');
    }
    showTraitPresetUnifiedPanel(traitPresetBackupPanelPlan);
    return true;
  }catch(e){
    rememberAppIssue('error','[trait preset backup panel failed]',e);
    renderTraitPresetOperationError('최신화',e?.message || '특성 프리셋 백업 준비 실패');
    return false;
  }
}
function hideTraitPresetBackupPanel(){
  traitPresetBackupPanelPlan=null;
  const panel=$('traitPresetBackupPanel');
  if(panel) panel.classList.remove('is-open');
  const overlay=$('traitPresetBackupOverlay');
  if(overlay) overlay.hidden=true;
  DPS_BODY.classList.remove('trait-preset-backup-open');
  if(traitPresetBackupPreviousFocus?.isConnected) traitPresetBackupPreviousFocus.focus({preventScroll:true});
  traitPresetBackupPreviousFocus=null;
}
function closeTraitPresetBackupPanel(){
  if(traitPresetBackupLocked) return false;
  hideTraitPresetBackupPanel();
  return true;
}
function createTraitPresetBackupFile(customName=''){
  const store=loadTraitPresetStore();
  if(!store.presets.length) throw new Error('백업할 프리셋이 없습니다.');
  const backupStore=finalizeTraitPresetStoreForExport(store);
  saveTraitPresetStore(backupStore,{source:'backup'});
  // 내려받는 파일에서만 룬 슬롯을 배열로 펼쳐서 1~10번을 읽기 쉽게 표시한다.
  // 앱 내부 저장값은 문자열 그대로 유지하며 가져오기는 동일 값을 다시 직렬화한다.
  const readablePresets=backupStore.presets.map(preset=>{
    const values={...preset.state.values};
    if(typeof values.additionalRuneSlots==='string') values.additionalRuneSlots=JSON.parse(values.additionalRuneSlots);
    return {...preset,state:{...preset.state,values}};
  });
  const payload=JSON.stringify({type:TRAIT_PRESET_FILE_TYPE,webDpsVersion:currentWebDpsVersion(),presetManagement:TRAIT_PRESET_MANAGEMENT_VERSION,exportedAt:formatTraitPresetExportedAt(),presets:readablePresets,jewelSettings:backupStore.jewelSettings,unitBoard:backupStore.unitBoard}, null, 2);
  const fileName=makeTraitPresetFileName(customName);
  // Android 앱에서는 blob: 다운로드 대신 시스템 문서 저장 화면을 사용한다.
  // 웹에서는 기존 다운로드 흐름과 백업 데이터 구조를 그대로 유지한다.
  if(window.NativeAndroid && typeof window.NativeAndroid.saveBackup==='function'){
    if(!window.NativeAndroid.saveBackup(fileName,payload)) throw new Error('안드로이드 파일 저장 요청에 실패했습니다.');
    return fileName;
  }
  const blob=new Blob([payload], {type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=fileName;
  DPS_BODY.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),0);
  return fileName;
}
function runTraitPresetBackup(){
  if(traitPresetBackupLocked) return false;
  const plan=traitPresetBackupPanelPlan;
  if(!plan) return false;
  const customName=$('traitPresetBackupName')?.value || '';
  let snapshot=null, imported=false;
  setTraitPresetBackupSavingState(true);
  try{
    if(plan.reviewedStore!==localStorage.getItem(TRAIT_PRESET_STORAGE_KEY) || plan.reviewedDrafts!==localStorage.getItem(TRAIT_PRESET_DRAFT_STORAGE_KEY)) throw new Error('검토 중 프리셋이 변경되었습니다. 닫고 다시 실행해 주세요.');
    snapshot=captureTraitPresetMutationSnapshot();
    storageState.presetMutationInProgress=true;
    if(plan.mode==='import'){
      imported=runTraitPresetImport(plan,customName,plan.recovery.needsReview);
      return imported;
    }
    if(plan.mode==='update'){
      if(!updateTraitPreset()) throw new Error('프리셋 변경사항을 적용하지 못했습니다.');
      hideTraitPresetBackupPanel();return true;
    }
    if(plan.migration){
      saveTraitPresetStore(plan.migrationStore,{source:'schemaUpdate'});
    }
    if((plan.hasCurrentPending || plan.hasDraftPending) && plan.previewStore && !plan.migration){
      saveTraitPresetStore(plan.previewStore,{source:'backup'});
      if(plan.selectedId && !loadTraitPresetById(plan.selectedId,{notifySuccess:false,preserveSharedValues:false,useDraft:false,discardDraft:false})) throw new Error('프리셋 최신화 결과를 적용하지 못했습니다.');
    }else if(plan.migration){
      const id=selectedTraitPresetId() || loadTraitPresetStore().presets[0]?.id;
      if(id && !loadTraitPresetById(id,{notifySuccess:false,preserveSharedValues:false,useDraft:false,discardDraft:false})) throw new Error('최신화 결과를 적용하지 못했습니다.');
    }
    const fileName=createTraitPresetBackupFile(customName);
    clearTraitPresetDrafts();
    notifyTraitPresetBackupComplete();
    notifyTraitPresetBackupFileComplete(fileName);
    hideTraitPresetBackupPanel();
    return true;
  }catch(e){
    restoreTraitPresetMutationSnapshot(snapshot,'[trait preset backup rollback failed]');
    rememberAppIssue('error','[trait preset backup failed]',e);
    renderTraitPresetBackupError(e?.message || '특성 프리셋 백업 실패');
    return false;
  }finally{
    storageState.presetMutationInProgress=false;
    setTraitPresetBackupSavingState(false);
    if(imported) closeTraitPresetManager(true);
  }
}
function resetTraitPresetImportInput(input=$('traitPresetImportFile')){
  if(!input) return null;
  const fresh=input.cloneNode(false);
  fresh.disabled=false;
  fresh.value='';
  input.replaceWith(fresh);
  return fresh;
}
function openTraitPresetImportPicker(){
  closeTraitPresetCustomSelects();
  setTimeout(()=>{
    const input=resetTraitPresetImportInput();
    if(input && !input.disabled) input.click();
  },60);
}
/* ── 02 · 스키마 검증·마이그레이션 ── */
/* 웹앱 빌드 번호와 데이터 형식을 구분한다. */
const TRAIT_PRESET_SCHEMA_ROOT_KEYS=new Set(['type','webDpsVersion','presetManagement','presets','jewelSettings','unitBoard','exportedAt']);
const TRAIT_PRESET_SCHEMA_ITEM_KEYS=new Set(['id','name','createdAt','updatedAt','meta','state','savedAt']);
const TRAIT_PRESET_SCHEMA_STATE_KEYS=new Set(['values','inv','zeroScore']);
function traitPresetSchemaDefaults(){
  const state=storageState.factoryState || makePublicDefaultState();
  const values=Object.fromEntries(Object.entries(state.values).filter(([id])=>isUserStateValueId(id) && !isTraitPresetExcludedValueId(id)));
  userStateElementIds().forEach(id=>{
    if(isTraitPresetExcludedValueId(id)) return;
    const el=$(id);
    if(el) values[id]=hasOwn(state.values,id) ? state.values[id] : elementDefaultValue(el);
  });
  return {
    values:sanitizeTraitPresetValues(values),
    inv:Object.fromEntries(TRAITS.map(trait=>[trait[0],0])),
    zeroScore:normalizeZeroScoreState(state.zeroScore || {rows:[]}),
    jewelSettings:normalizeTraitPresetJewelSettings({legendaryMythicJewels:{}}),
    unitBoard:normalizeTraitPresetUnitBoardState({})
  };
}
// 원본 검사를 통과한 데이터에만 현재 필수 항목의 기본값을 채운다.
function completeTraitPresetStoreSchema(raw){
  const defaults=traitPresetSchemaDefaults();
  const completed=normalizeTraitPresetStore({
    ...raw,
    presets:raw.presets.map(preset=>{
      const values={...defaults.values,...preset.state.values};
      // 유닛 보드의 표시 칸 수는 별도 저장되므로 없는 기존 프리셋에는 강제로 추가하지 않는다.
      if(!hasOwn(preset.state.values,'dpsBaseUnitVisibleSlotCount')) delete values.dpsBaseUnitVisibleSlotCount;
      return {...preset,state:{...preset.state,values,inv:{...defaults.inv,...preset.state.inv},zeroScore:preset.state.zeroScore ?? defaults.zeroScore}};
    }),
    jewelSettings:raw.jewelSettings==null ? defaults.jewelSettings : {legendaryMythicJewels:{},...raw.jewelSettings},
    unitBoard:{presets:Object.fromEntries(raw.presets.map(preset=>[
      preset.id,raw.unitBoard?.presets?.[preset.id] ?? defaults.unitBoard
    ]))}
  });
  if(completed.presets.length!==raw.presets.length) throw new Error('프리셋 일부를 유지할 수 없어 업데이트를 취소했습니다.');
  if(inspectTraitPresetImportCompatibility(completed).requiresUpdate) throw new Error('업데이트 결과가 현재 형식을 만족하지 않습니다.');
  return completed;
}
// 원본 검사 전에는 정규화하지 않는다. 누락은 업데이트 대상, 해석할 수 없는 값은 오류다.
function inspectTraitPresetImportCompatibility(parsed,options={}){
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  const invalid=path=>{throw new Error(`${traitPresetImportErrorLocation(path)}: 현재 형식 또는 허용값과 다릅니다. 원본 데이터는 보존됩니다. 저장 파일의 값을 확인한 뒤 다시 가져와 주세요.`);};
  if(!object(parsed) || !Array.isArray(parsed.presets)) invalid('프리셋 목록');
  if(parsed.type!==undefined && !isTraitPresetFileType(parsed.type)) invalid('파일 종류');
  const schema=parsed.presetManagement;
  if(schema!==undefined && (typeof schema!=='number' || !Number.isInteger(schema) || schema<1 || schema>TRAIT_PRESET_MANAGEMENT_VERSION)) invalid('프리셋 관리 버전');
  const issues=[];
  Object.keys(parsed).filter(key=>!TRAIT_PRESET_SCHEMA_ROOT_KEYS.has(key)).forEach(key=>issues.push(`공통.${key}`));
  if(schema!==TRAIT_PRESET_MANAGEMENT_VERSION) issues.push('프리셋 관리 버전');
  if(parsed.type===undefined) issues.push('파일 종류');
  if(parsed.webDpsVersion===undefined) issues.push('웹 버전 정보');
  else if(typeof parsed.webDpsVersion!=='string') invalid('웹 버전 정보');
  const defaults=traitPresetSchemaDefaults();
  const checkShape=(raw,current,path)=>{
    if(raw===undefined){issues.push(path);return;}
    if(Array.isArray(current)){
      if(!Array.isArray(raw) || raw.length!==current.length) invalid(path);
      current.forEach((value,index)=>checkShape(raw[index],value,`${path}[${index+1}]`));
    }else if(object(current)){
      if(!object(raw)) invalid(path);
      Object.keys(current).forEach(key=>checkShape(raw[key],current[key],`${path}.${key}`));
      Object.keys(raw).filter(key=>!hasOwn(current,key)).forEach(key=>issues.push(`${path}.${key}`));
    }else{
      if(typeof raw!==typeof current || (typeof raw==='number' && !Number.isFinite(raw))) invalid(path);
      if(raw!==current){
        // 구버전 백업은 미설정 카드를 표시 슬롯으로 세었다. 유효한 과거 값만 자동 정리한다.
        if(path.endsWith('.유닛 보드.visibleSlotCount') && typeof raw==='number' &&
          Number.isInteger(raw) && raw>=current && raw<=dpsBaseUnitSelectionLimit()) return;
        // 숫자 표기만 다른 경우에는 의미를 바꾸지 않고 정리할 수 있다.
        if(typeof raw==='string' && raw.trim()!=='' && current.trim()!=='' && Number.isFinite(Number(raw)) && Number(raw)===Number(current)) issues.push(path);
        else invalid(path);
      }
    }
  };
  const ids=new Set(),names=new Set();
  parsed.presets.forEach((item,index)=>{
    const path=traitPresetImportPresetPath(item,index+(options.indexOffset || 0));
    if(!object(item) || typeof item.id!=='string' || !item.id.trim() || item.id!==item.id.trim() || ids.has(item.id) ||
       typeof item.name!=='string' || !normalizeTraitPresetName(item.name) || names.has(normalizeTraitPresetName(item.name)) ||
       !object(item.state) || !object(item.state.values)) invalid(path);
    ids.add(item.id);names.add(normalizeTraitPresetName(item.name));
    Object.keys(item).filter(key=>!TRAIT_PRESET_SCHEMA_ITEM_KEYS.has(key)).forEach(key=>issues.push(`${path}.${key}`));
    Object.keys(item.state).filter(key=>!TRAIT_PRESET_SCHEMA_STATE_KEYS.has(key)).forEach(key=>issues.push(`${path}.state.${key}`));
    const values=item.state.values;
    const hasLegacyDonation=hasOwn(values,'donationBuffType');
    if(hasLegacyDonation && !['none','sp','paid'].includes(values.donationBuffType)) invalid(`${path}.donationBuffType`);
    const canonical=sanitizeTraitPresetValues(values);
    Object.entries(defaults.values).forEach(([id,fallback])=>{
      // 유닛 보드에 별도 저장되는 칸 수는 과거 프리셋의 필수 항목이 아니다.
      if(!hasOwn(values,id)){
        // 이전 버전 프리셋에는 전투 모드가 없으며, 해당 경우 '일반'이 기본값이다.
        if(id!=='dpsBaseUnitVisibleSlotCount' && id!==PRESET_BATTLE_MODE_VALUE_ID) issues.push(`${path}.${id}`);
        return;
      }
      const value=values[id];
      if(typeof value!==typeof fallback) invalid(`${path}.${id}`);
      const allowed=TRAIT_PRESET_FIELD_OPTIONS.get(id);
      if(allowed?.size && !allowed.has(value)) invalid(`${path}.${id}`);
      const el=$(id);
      if(typeof value==='string' && el?.tagName==='INPUT' && id!=='enchantCode' &&
         (el.inputMode==='numeric' || el.inputMode==='decimal' || el.type==='number')){
        const number=Number(value.replace(/,/g,''));
        // 성소 라운드의 상한은 현재 화면 대신 해당 프리셋의 모드로 판단한다.
        const maximum=id==='skillRound' ? skillRoundMaximum(values.skillMode) : el.max;
        if(!value.trim() || !Number.isFinite(number) ||
           (el.min!=='' && number<Number(el.min)) || (maximum!=='' && number>Number(maximum))) invalid(`${path}.${id}`);
      }
      checkShape(value,canonical[id] ?? value,`${path}.${id}`);
    });
    // V47/V48 중복 저장 필드: 성소 정보의 권위 있는 위치는 유닛 보드 프리셋이다.
    Object.keys(values).filter(id=>!hasOwn(defaults.values,id)).forEach(id=>issues.push(`${path}.${id}`));
    if(item.state.inv!==undefined && !object(item.state.inv)) invalid(`${path}.inv`);
    const inv=item.state.inv || {};
    Object.keys(defaults.inv).forEach(row=>{
      if(!hasOwn(inv,row)){issues.push(`${path}.inv.${row}`);return;}
      const value=inv[row];
      // The legacy field is authoritative; its redundant old 116 value is replaced during update.
      if(row==='116' && hasLegacyDonation) return;
      if(typeof value!=='number' || !Number.isInteger(value) || value<0 || value>(TMAX[row] || 999)) invalid(`${path}.inv.${row}`);
    });
    Object.keys(inv).filter(row=>!hasOwn(defaults.inv,row)).forEach(row=>issues.push(`${path}.inv.${row}`));
    if(item.state.zeroScore===undefined) issues.push(`${path}.zeroScore`);
    else checkShape(item.state.zeroScore,normalizeZeroScoreState(item.state.zeroScore),`${path}.zeroScore`);
  });
  if(parsed.presets.length){
    if(parsed.jewelSettings==null) issues.push('쥬얼 설정');
    else{
      if(!object(parsed.jewelSettings)) invalid('쥬얼 설정');
      const current=normalizeTraitPresetJewelSettings({legendaryMythicJewels:{},...parsed.jewelSettings});
      if(!current) invalid('쥬얼 설정');
      checkShape(parsed.jewelSettings,current,'쥬얼 설정');
    }
    if(parsed.unitBoard===undefined) issues.push('유닛 보드');
    else if(!object(parsed.unitBoard)) invalid('유닛 보드');
    else {
      Object.keys(parsed.unitBoard).filter(key=>key!=='presets').forEach(key=>issues.push(`유닛 보드.${key}`));
    }
    if(parsed.unitBoard && !hasOwn(parsed.unitBoard,'presets')) issues.push('유닛 보드.presets');
    else if(parsed.unitBoard && !object(parsed.unitBoard.presets)) invalid('유닛 보드.presets');
    const boards=parsed.unitBoard?.presets || {};
    parsed.presets.forEach(item=>{
      if(!hasOwn(boards,item.id)) issues.push(`${item.name}.유닛 보드`);
      else{
        if(!object(boards[item.id])) invalid(`${item.name}.유닛 보드`);
        const normalizedBoard=normalizeTraitPresetUnitBoardState(boards[item.id]);
        checkShape(boards[item.id],normalizedBoard,`${item.name}.유닛 보드`);
      }
    });
    Object.keys(boards).filter(id=>!ids.has(id)).forEach(id=>issues.push(`유닛 보드.${id}`));
  }
  return {schema,issues,requiresUpdate:issues.length>0};
}
function traitPresetImportIssueChange(issue,source={}){
  const path=String(issue || '');
  const missing='저장 항목 없음';
  const info={
    '프리셋 관리 버전':['프리셋 관리 버전',source.presetManagement ?? missing,TRAIT_PRESET_MANAGEMENT_VERSION],
    '파일 종류':['프리셋 파일 종류',source.type ?? missing,'통합 프리셋 파일'],
    '웹 버전 정보':['백업 생성 웹 버전',source.webDpsVersion ?? missing,currentWebDpsVersion()],
    '쥬얼 설정':['쥬얼 설정 저장 항목',missing,'기본 쥬얼 설정 추가'],
    '유닛 보드':['유닛 보드 저장 항목',missing,'기본 유닛 보드 추가'],
    '유닛 보드.presets':['유닛 보드별 프리셋 목록',missing,'프리셋별 보드 목록 추가'],
    '유닛 보드 목록':['유닛 보드별 프리셋 목록',missing,'프리셋별 보드 목록 추가']
  }[path] || ['기타 저장 형식',missing,'현재 저장 형식으로 보완'];
  const key=path==='유닛 보드 목록' ? '유닛 보드.presets' : path;
  return {key:`import:${key}`,label:info[0],before:String(info[1]),after:String(info[2])};
}
function traitPresetObsoleteChange(key,label,description='과거 데이터 보존 중'){
  return {key,label,before:description,after:'삭제'};
}
function traitPresetMigrationChanges(raw){
  const inspected=inspectTraitPresetImportCompatibility(raw);
  const defaults=traitPresetSchemaDefaults();
  const common=[];
  const byPreset=new Map();
  const add=(target,change)=>{ if(!target.some(item=>item.key===change.key)) target.push(change); };
  const boards=raw.unitBoard?.presets || {};
  Object.keys(raw).filter(key=>!TRAIT_PRESET_SCHEMA_ROOT_KEYS.has(key)).forEach(key=>
    add(common,traitPresetObsoleteChange(`obsolete:root:${key}`,traitPresetChangeKeyLabel(`obsolete:root:${key}`))));
  Object.keys(raw.unitBoard || {}).filter(key=>key!=='presets').forEach(key=>
    add(common,traitPresetObsoleteChange(`obsolete:unitBoard:${key}`,traitPresetChangeKeyLabel(`obsolete:unitBoard:${key}`))));
  (raw.presets || []).forEach((preset,index)=>{
    const changes=[];
    const rawValues=preset.state?.values || {};
    const prefix=traitPresetImportPresetPath(preset,index)+'.';
    Object.keys(preset).filter(key=>!TRAIT_PRESET_SCHEMA_ITEM_KEYS.has(key)).forEach(key=>
      add(changes,traitPresetObsoleteChange(`obsolete:preset:${key}`,traitPresetChangeKeyLabel(`obsolete:preset:${key}`))));
    Object.keys(preset.state || {}).filter(key=>!TRAIT_PRESET_SCHEMA_STATE_KEYS.has(key)).forEach(key=>
      add(changes,traitPresetObsoleteChange(`obsolete:state:${key}`,traitPresetChangeKeyLabel(`obsolete:state:${key}`))));
    Object.keys(rawValues).filter(id=>!hasOwn(defaults.values,id)).forEach(id=>{
      const removedLabel=REMOVED_PRESET_VALUE_LABELS[id];
      const label=traitPresetChangeKeyLabel(`obsolete:value:${id}`);
      const previous=removedLabel
        ? (id==='janRuneScope' ? (rawValues[id]==='J2' ? '전체 투자 @J2' : '공격 오펜 @J1') : String(rawValues[id]))
        : '과거 데이터 보존 중';
      add(changes,traitPresetObsoleteChange(`obsolete:value:${id}`,label,previous));
    });
    Object.keys(preset.state?.inv || {}).filter(id=>!hasOwn(defaults.inv,id)).forEach(id=>
      add(changes,traitPresetObsoleteChange(`obsolete:inv:${id}`,traitPresetChangeKeyLabel(`obsolete:inv:${id}`))));
    const board=boards[preset.id];
    if(board && typeof board==='object'){
      const canonical=normalizeTraitPresetUnitBoardState(board);
      if(hasOwn(board,'visibleSlotCount') && board.visibleSlotCount!==canonical.visibleSlotCount)
        add(changes,{key:'schema:visibleSlotCount',label:'유닛 보드 · 표시 슬롯 수',before:String(board.visibleSlotCount),after:String(canonical.visibleSlotCount)});
      const boardIssues=inspected.issues.filter(path=>path.startsWith(`${preset.name}.유닛 보드.`));
      boardIssues.forEach(path=>{
        const suffix=path.slice(`${preset.name}.유닛 보드.`.length);
        const top=suffix.split(/[.\[]/)[0];
        if(hasOwn(board,top) && !hasOwn(canonical,top)){
          add(changes,traitPresetObsoleteChange(`obsolete:board:${suffix}`,traitPresetChangeKeyLabel(`obsolete:board:${suffix}`)));
        }else if(top==='visibleSlotCount' && board.visibleSlotCount!==canonical.visibleSlotCount){
          add(changes,{key:'schema:visibleSlotCount',label:'유닛 보드 · 표시 슬롯 수',before:String(board.visibleSlotCount),after:String(canonical.visibleSlotCount)});
        }else if(top==='sanctuaryInfo' && hasOwn(board,'sanctuaryInfo')){
          const after=canonical.sanctuaryInfo;
          const before=board.sanctuaryInfo;
          if(stableTraitPresetValue(before)!==stableTraitPresetValue(after))
            add(changes,{key:'schema:sanctuaryInfo',label:'유닛 보드 · 성소 정보 형식',before:'과거 저장 방식',after:'현재 형식'});
        }else if(top!=='sanctuaryInfo' && top!=='visibleSlotCount'){
          add(changes,{key:`schema:board:${suffix}`,label:traitPresetChangeKeyLabel(`schema:board:${suffix}`),before:'이전 저장 방식',after:'현재 형식'});
        }
      });
    }
    inspected.issues.filter(path=>path.startsWith(prefix)).forEach(path=>{
      const id=path.slice(prefix.length).split(/[.\[]/)[0];
      if(id==='inv' || id==='zeroScore' || hasOwn(rawValues,id)) return;
      if(hasOwn(defaults.values,id)){
        const isInvestmentSwitch=TRAIT_PRESET_INVESTMENT_SWITCH_IDS.has(id);
        const after=isInvestmentSwitch ? `${traitPresetChangeValueText(`value:${id}`,defaults.values[id])} (기본값 적용)` : '기본값 추가';
        add(changes,{key:`schema:value:${id}`,label:traitPresetImportReadableName(id),before:'저장값 없음',after});
      }
    });
    if(changes.length) byPreset.set(preset.id,changes);
  });
  if(raw.jewelSettings && typeof raw.jewelSettings==='object'){
    const canonical=normalizeTraitPresetJewelSettings({legendaryMythicJewels:{},...raw.jewelSettings});
    Object.keys(raw.jewelSettings).filter(key=>!hasOwn(canonical || {},key)).forEach(key=>
      add(common,traitPresetObsoleteChange(`obsolete:jewel:${key}`,traitPresetChangeKeyLabel(`obsolete:jewel:${key}`))));
  }
  Object.keys(boards).filter(id=>!(raw.presets || []).some(preset=>preset.id===id)).forEach(id=>
    add(common,traitPresetObsoleteChange(`obsolete:board-link:${id}`,traitPresetChangeKeyLabel(`obsolete:board-link:${id}`))));
  const rootIssues=inspected.issues.filter(path=>!path.startsWith('프리셋 ') && !(raw.presets || []).some(preset=>path.startsWith(`${preset.name}.유닛 보드.`)));
  rootIssues.forEach(path=>{
    if(path.startsWith('쥬얼 설정.') || path.startsWith('유닛 보드.') && !['유닛 보드.presets'].includes(path)) return;
    if(!['프리셋 관리 버전','파일 종류','웹 버전 정보','쥬얼 설정','유닛 보드','유닛 보드.presets','유닛 보드 목록'].includes(path)) return;
    add(common,traitPresetImportIssueChange(path,raw));
  });
  return {common,byPreset,issues:inspected.issues};
}
function prepareTraitPresetImportRecovery(parsed,fileName=''){
  if(!isTraitPresetFileType(parsed?.type)) throw new Error(TRAIT_PRESET_INVALID_FILE_MESSAGE);
  if(!Array.isArray(parsed.presets)) throw new Error(TRAIT_PRESET_INVALID_FILE_MESSAGE);
  inspectTraitPresetImportCompatibility({...parsed,presets:[]});
  if(!parsed.presets?.length) throw new Error('가져올 수 있는 프리셋이 없습니다.');
  const source=JSON.parse(JSON.stringify(parsed));
  // 읽기 좋게 배열로 내보낸 룬 10칸을 기존 저장용 문자열로 되돌린다.
  // 기존 문자열 백업도 그대로 받아들여 프리셋 저장 형식은 바꾸지 않는다.
  source.presets.forEach(preset=>{
    const values=preset?.state?.values;
    if(Array.isArray(values?.additionalRuneSlots)) values.additionalRuneSlots=JSON.stringify(values.additionalRuneSlots);
  });
  const defaults=traitPresetSchemaDefaults();
  let sharedError='',sharedIssues=[];
  try{
    if(source.unitBoard!==undefined && (!source.unitBoard || typeof source.unitBoard!=='object' || Array.isArray(source.unitBoard) ||
       (source.unitBoard.presets!==undefined && (!source.unitBoard.presets || typeof source.unitBoard.presets!=='object' || Array.isArray(source.unitBoard.presets))))) throw new Error('공통 유닛 보드 목록의 형식을 확인해 주세요.');
    sharedIssues=inspectTraitPresetImportCompatibility({...source,presets:[{id:'schema_probe',name:'검사',state:{values:defaults.values,inv:defaults.inv,zeroScore:defaults.zeroScore}}],unitBoard:{presets:{schema_probe:defaults.unitBoard}}}).issues;
    if(source.unitBoard===undefined || source.unitBoard.presets===undefined) sharedIssues.push('유닛 보드 목록');
  }catch(error){sharedError=error.message;}
  const sharedChanges=[...new Map([
    ...sharedIssues.map(issue=>{const change=traitPresetImportIssueChange(issue,source);return [change.key,change];}),
    ...traitPresetMigrationChanges({...source,presets:[],unitBoard:{presets:{}}}).common.map(change=>[change.key,change]),
    ...Object.keys(source.unitBoard || {}).filter(key=>key!=='presets').map(key=>{const change=traitPresetObsoleteChange(`obsolete:unitBoard:${key}`,traitPresetChangeKeyLabel(`obsolete:unitBoard:${key}`));return [change.key,change];}),
    ...Object.keys(source.unitBoard?.presets || {}).filter(id=>!source.presets.some(item=>item?.id===id)).map(id=>{const change=traitPresetObsoleteChange(`obsolete:board-link:${id}`,traitPresetChangeKeyLabel(`obsolete:board-link:${id}`));return [change.key,change];})
  ]).values()];
  const idCounts=new Map(),nameCounts=new Map();
  source.presets.forEach(item=>{
    if(typeof item?.id==='string') idCounts.set(item.id,(idCounts.get(item.id)||0)+1);
    if(typeof item?.name==='string'){
      const name=normalizeTraitPresetName(item.name);
      nameCounts.set(name,(nameCounts.get(name)||0)+1);
    }
  });
  const rows=source.presets.map((raw,index)=>{
    const name=typeof raw?.name==='string' ? raw.name : `이름 없는 프리셋 ${index+1}`;
    const row={index,name,raw,changes:[],issues:[],error:'',candidate:null};
    try{
      if(idCounts.get(raw?.id)>1 || nameCounts.get(normalizeTraitPresetName(raw?.name))>1) throw new Error('다른 프리셋과 이름 또는 저장 식별자가 중복됩니다. 원본 파일에서 구분해 주세요.');
      const candidate=JSON.parse(JSON.stringify(raw));
      const values=candidate?.state?.values;
      if(values && PLANET_EXPLORATION_MONTHLY_DIFFICULTIES.includes(values.diff)){
        row.changes.push({key:'value:diff',label:'난이도',before:values.diff,after:PLANET_EXPLORATION_STORAGE_NAME});
        values.diff=PLANET_EXPLORATION_STORAGE_NAME;
      }
      const single={...source,presets:[candidate],jewelSettings:defaults.jewelSettings,unitBoard:{presets:{}}};
      if(hasOwn(source.unitBoard?.presets,raw?.id)) single.unitBoard.presets[raw.id]=source.unitBoard.presets[raw.id];
      const check=inspectTraitPresetImportCompatibility(single,{indexOffset:index});
      row.issues=check.issues.filter(issue=>issue.startsWith(`${traitPresetImportPresetPath(candidate,index)}.`) || issue.startsWith(`${name}.`));
      const completed=completeTraitPresetStoreSchema(single);
      row.candidate=completed;
      const next=completed.presets[0];
      Object.entries(next.state.values).forEach(([id,value])=>{
        if(id==='dpsBaseUnitVisibleSlotCount') return;
        if(!hasOwn(raw.state.values,id)){
          const text=traitPresetChangeValueText(`value:${id}`,value,next.state);
          const isInvestmentSwitch=TRAIT_PRESET_INVESTMENT_SWITCH_IDS.has(id);
          row.changes.push({key:`value:${id}`,label:traitPresetImportReadableName(id),before:'저장값 없음',after:isInvestmentSwitch ? `${text} (기본값 적용)` : text});
        }
      });
      if(hasOwn(raw.state.values,'donationBuffType')) row.changes.push({key:'donationMigration',label:'나눔 저장 방식',before:'기존 중복 저장',after:'통합 저장'});
      const missingInvestments=Object.keys(defaults.inv).filter(key=>!hasOwn(raw.state.inv || {},key));
      if(missingInvestments.includes('116')) row.changes.push({key:'inv:116',label:'나눔 설정',before:'저장값 없음',after:traitPresetChangeValueText('inv:116',next.state.inv[116],next.state)});
      if(missingInvestments.some(key=>key!=='116')) row.changes.push({key:'importRepair',label:`누락된 특성 투자 항목 ${missingInvestments.filter(key=>key!=='116').length}개`,before:'항목 없음',after:'기본값 0'});
      if(raw.state.zeroScore===undefined) row.changes.push({key:'zeroScore',label:'더제로 전당 계산값',before:'항목 없음',after:'기본값'});
      if(!hasOwn(source.unitBoard?.presets,raw.id)) row.changes.push({key:'unitBoard',label:'유닛 보드',before:'항목 없음',after:'빈 보드'});
      else if(!hasOwn(source.unitBoard.presets[raw.id],'sanctuaryInfo')) row.changes.push({key:'sanctuaryInfo:init',label:'성소 정보 · 신규 항목',before:'저장 항목 없음',after:'기본 0슬롯'});
      else{
        // V2에서 0회로 저장된 선택 스킬 등, 정규화로 바뀌는 횟수만 개별 변경으로 명시한다.
        const previous=source.unitBoard.presets[raw.id].sanctuaryInfo?.slots;
        const nextSlots=completed.unitBoard.presets[raw.id]?.sanctuaryInfo.slots || [];
        if(Array.isArray(previous)) previous.slice(0,10).forEach((slot,index)=>{
          for(const count of ['count1','count2']){
            const before=slot?.[count],after=nextSlots[index]?.[count];
            if(typeof before==='number' && before!==after){
              const key=`sanctuaryInfo:${index}:${count}`;
              row.changes.push({key,label:traitPresetChangeKeyLabel(key),before:String(before),after:String(after)});
            }
          }
        });
      }
      const obsolete=traitPresetMigrationChanges(single).byPreset.get(raw.id) || [];
      obsolete.forEach(change=>{if(!row.changes.some(existing=>existing.key===change.key)) row.changes.push(change);});
      if(row.issues.length && !row.changes.length) row.changes.push({key:'importRepair',label:'저장 항목 형식',before:'일부 항목 보완 필요',after:'현재 형식'});
    }catch(error){
      row.error=String(error?.message || '저장 상태를 확인해 주세요.').replace(traitPresetImportPresetPath(raw,0),traitPresetImportPresetPath(raw,index));
      row.candidate=null;
    }
    return row;
  });
  const commonChanges=new Map();
  rows.forEach(row=>{
    row.individualChanges=[];
    row.changes.forEach(change=>{
      if(traitPresetImportChangeIsShared(change.key)){
        if(!commonChanges.has(change.key)) commonChanges.set(change.key,{...change,count:0});
        commonChanges.get(change.key).count++;
      }else row.individualChanges.push(change);
    });
  });
  const commonChangeRows=[...commonChanges.values()];
  const candidates=rows.filter(row=>row.candidate);
  const conflicting=candidates.length>1 && new Set(candidates.map(row=>traitPresetSharedStateSignature(row.candidate.presets[0].state))).size>1;
  return {source,rows,fileName,sharedError,sharedIssues,sharedChanges,commonChanges:commonChangeRows,
    needsReview:!!sharedError || !!sharedIssues.length || !!commonChangeRows.length || conflicting || rows.some(row=>row.error || row.individualChanges.length)};
}
function resolveTraitPresetRecoveryPlan(plan,sharedSourceIndex=''){
  if(plan.sharedError) throw new Error(plan.sharedError);
  const selected=plan.rows;
  if(!selected.length) throw new Error('가져올 프리셋이 없습니다.');
  selected.forEach(row=>{
    if(row.error || !row.candidate) throw new Error(`${row.name}: 원본 파일을 수정한 뒤 다시 가져와 주세요.`);
  });
  const distinct=new Set(selected.map(row=>traitPresetSharedStateSignature(row.candidate.presets[0].state)));
  const conflicting=distinct.size>1;
  const source=conflicting ? selected.find(row=>String(row.index)===String(sharedSourceIndex)) : selected[0];
  if(!source) throw new Error('공통 설정 값이 서로 다릅니다. 적용할 프리셋을 선택해 주세요.');
  const baseState=source.candidate.presets[0].state;
  const sharedKeys=traitPresetSharedStateKeys(baseState);
  const presets=[],boards={};
  let syncedCount=0;
  selected.forEach(row=>{
    const candidate=row.candidate;
    const item=candidate.presets[0];
    const nextState=buildSyncedTraitPresetState(baseState,item.state,sharedKeys);
    if(!nextState) throw new Error(`${row.name}: 공통 설정을 적용할 수 없습니다.`);
    if(stableTraitPresetValue(nextState)!==stableTraitPresetValue(item.state)) syncedCount++;
    presets.push({...item,state:nextState});
    boards[item.id]=candidate.unitBoard.presets[item.id];
  });
  const imported={...plan.source,presets,unitBoard:{presets:boards}};
  inspectTraitPresetImportCompatibility(imported);
  const completed=completeTraitPresetStoreSchema(imported);
  const repairedRows=selected.filter(row=>row.individualChanges.length);
  const singleChangeKeysByPreset=Object.fromEntries(repairedRows.map(row=>[
    row.candidate.presets[0].id,[...new Set(row.individualChanges.map(change=>change.key || 'importRepair'))]
  ]));
  const sharedUpdated=!!(plan.sharedIssues.length || plan.commonChanges.length || syncedCount);
  const commonChangeKeys=[...new Set([
    ...plan.commonChanges.map(change=>change.key),
    ...plan.sharedChanges.map(change=>change.key),
    ...(syncedCount ? ['state:shared'] : [])
  ])];
  return {data:completed,sharedUpdated,commonChangeKeys,singleChangeKeysByPreset,
    changeDetails:plan.sharedChanges.map(change=>traitPresetChangeDetail(change.key,change.before,change.after,'common'))};
}
function normalizeTraitPresetImportData(parsed){
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('특성 프리셋 파일 형식이 아닙니다.');
  if(!isTraitPresetFileType(parsed.type)) throw new Error(TRAIT_PRESET_INVALID_FILE_MESSAGE);
  if(!Array.isArray(parsed.presets)) throw new Error(TRAIT_PRESET_INVALID_FILE_MESSAGE);
  if(!parsed.presets.length) throw new Error('가져올 수 있는 프리셋이 없습니다.');
  inspectTraitPresetImportCompatibility(parsed);
  return JSON.parse(JSON.stringify(parsed));
}
function replaceTraitPresetImport(imported){
  // 누락을 숨기지 않도록 업데이트 전에는 가져온 원본 구조를 유지한다.
  const store=saveTraitPresetStore(imported,{source:'import',allowPending:true});
  clearTraitPresetDrafts();
  clearTraitPresetUpdatedStatus('import');
  return {store,count:store.presets.length,firstImportedPresetId:store.presets[0]?.id || ''};
}
/* ── 03 · 파일 읽기·가져오기 실행·롤백 ── */
function isTraitPresetTextFile(file){
  // 내보내기 기본 확장자는 .txt이며 같은 JSON 형식의 .json 파일도 허용한다.
  return /\.(?:txt|json)$/i.test(String(file?.name || ''));
}
function readTraitPresetFileAsText(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.addEventListener('load',()=>resolve(String(reader.result||'')),{once:true});
    reader.addEventListener('error',()=>reject(new Error('파일을 읽지 못했습니다.')),{once:true});
    reader.addEventListener('abort',()=>reject(new Error('파일 읽기가 취소되었습니다.')),{once:true});
    reader.readAsText(file,'utf-8');
  });
}
function captureTraitPresetMutationSnapshot(){
  const keys=[STORAGE_KEY,TRAIT_PRESET_STORAGE_KEY,TRAIT_PRESET_STATUS_STORAGE_KEY,TRAIT_PRESET_DRAFT_STORAGE_KEY];
  return {
    storage:keys.map(key=>[key,localStorage.getItem(key)]),
    state:makeStateObject(),
    jewels:captureTraitPresetJewelSettings(),
    unitBoard:captureTraitPresetUnitBoardState(),
    hasSavedState:storageState.hasSavedState,
    selectedId:selectedTraitPresetId()
  };
}
function restoreTraitPresetMutationSnapshot(snapshot,issueLabel='[trait preset rollback failed]'){
  if(!snapshot) return;
  try{
    storageState.hasSavedState=snapshot.hasSavedState;
    snapshot.storage.forEach(([key,value])=>{
      if(value===null) localStorage.removeItem(key);
      else localStorage.setItem(key,value);
    });
    applyStateObject(snapshot.state,{recalculate:false});
    applyTraitPresetJewelSettings(snapshot.jewels);
    applyTraitPresetUnitBoardState(snapshot.unitBoard,{recalculate:false});
    recalc({save:false});
    refreshTraitPresetControls(snapshot.selectedId);
  }catch(error){rememberAppIssue('error',issueLabel,error);}
}
function runTraitPresetImport(plan,customName,createBackup=true){
  const recovery=plan.recovery;
  const source=$('traitPresetImportSharedSource')?.value || '';
  const resolved=resolveTraitPresetRecoveryPlan(recovery,source);
  const imported=normalizeTraitPresetImportData(resolved.data);
  const compatibility=inspectTraitPresetImportCompatibility(imported);
  if(compatibility.requiresUpdate) throw new Error('가져올 프리셋의 구조 정리가 완료되지 않았습니다.');
  const result=replaceTraitPresetImport(imported);
  const loadId=result.firstImportedPresetId;
  if(!loadId || !loadTraitPresetById(loadId,{notifySuccess:false,preserveSharedValues:false,useDraft:false,discardDraft:false}))
    throw new Error('가져온 프리셋을 화면에 적용하지 못해 가져오기를 취소했습니다.');
  const fileName=createBackup ? createTraitPresetBackupFile(customName) : '';
  clearTraitPresetDrafts();
  if(createBackup){
    notifyTraitPresetBackupComplete();
    notifyTraitPresetBackupFileComplete(fileName);
  }
  hideTraitPresetBackupPanel();
  showToast(createBackup ? `프리셋 ${result.count}개 최신화·가져오기 완료` : `프리셋 ${result.count}개 가져오기 완료`,'ok');
  return true;
}
async function importTraitPresetFile(file){
  if(traitPresetImportPending || traitPresetBackupLocked || $('traitPresetBackupPanel')?.classList.contains('is-open')){
    notifyStorageAction('프리셋 작업을 완료한 뒤 다시 시도하세요.','warn');
    return false;
  }
  traitPresetImportPending=true;
  try{
    if(!isTraitPresetTextFile(file)) throw new Error('특성 프리셋 .txt 또는 .json 파일만 가져올 수 있습니다.');
    const raw=await readTraitPresetFileAsText(file);
    const parsed=safeJsonParse(raw);
    const recovery=prepareTraitPresetImportRecovery(parsed,file.name);
    if(DPS_ROOT.hidden || $('traitPresetManagerOverlay')?.hidden) return false;
    // 정상 파일은 V5 방식으로 즉시 가져온다. 구형·충돌 파일만 최신화 검토를 거친다.
    if(!recovery.needsReview){
      const snapshot=captureTraitPresetMutationSnapshot();
      try{
        storageState.presetMutationInProgress=true;
        const imported=runTraitPresetImport({mode:'import',recovery},'',false);
        if(imported) closeTraitPresetManager(true);
        return imported;
      }catch(error){
        restoreTraitPresetMutationSnapshot(snapshot,'[trait preset direct import rollback failed]');
        throw error;
      }finally{storageState.presetMutationInProgress=false;}
    }
    const existingCount=loadTraitPresetStore().presets.length;
    traitPresetBackupPanelPlan={mode:'import',recovery,existingCount,hasPending:true};
    showTraitPresetUnifiedPanel(traitPresetBackupPanelPlan);
    return true;
  }catch(e){
    rememberAppIssue('error','[trait preset import failed]',e);
    if(!DPS_ROOT.hidden && !$('traitPresetManagerOverlay')?.hidden) renderTraitPresetOperationError('가져오기',e?.message || '특성 프리셋 가져오기 실패');
    return false;
  }finally{
    traitPresetImportPending=false;
  }
}
