/* 프리셋 관리 레이어
 * - 저장값 정규화: 숫자/룬/유닛 보드/재화 상태
 * - 파일 입출력·최신화: preset_io.js
 * - 프리셋 목록: 필터, 정렬, 선택, 삭제, 갱신
 * - 현재 상태 적용: 특성/유닛 보드/기본 정보 동기화
 * - 변경 상태: 업데이트됨/백업 필요 표시
 */
/* ── 01 · 버전·저장값 정규화 ── */
/* 버전·상태 정규화 */
const STORAGE_VERSION=DPS_CONFIG.storage.version;
const STORAGE_SCOPE=DPS_CONFIG.storage.scope;
const STORAGE_KEY=DPS_CONFIG.storage.key;
const CLIENT_KEY=DPS_CONFIG.storage.clientKey;
const TRAIT_PRESET_STORAGE_KEY=DPS_CONFIG.storage.traitPresetKey || 'gbd_dps_calculator:trait_presets';
const TRAIT_PRESET_FILE_TYPE='sld_dps_total_preset';
const TRAIT_PRESET_MANAGEMENT_VERSION=3;
const PRESET_BATTLE_MODE_VALUE_ID='battleDpsMode';
function normalizePresetBattleMode(value){return value==='artifact' ? 'artifact' : 'normal';}
const APP_STATE_SCHEMA_VERSION=2;
// 화면의 선택 제한과 무관하게 현재 스키마의 전체 허용값을 보관한다.
const TRAIT_PRESET_FIELD_OPTIONS=new Map([...qsa('select[id]')].map(el=>[
  el.id,new Set([...el.options].map(option=>el.id==='diff' && isPlanetExplorationDifficulty(option.value) ? PLANET_EXPLORATION_STORAGE_NAME : option.value))
]));
const TRAIT_PRESET_EXCLUDED_VALUE_IDS=new Set([
  'dpsBaseUnits','dpsBaseUnitSlots','dpsJewelSettings','dpsBaseUnitExtraSettings','dpsBaseUnitSlotExpansions','dpsSanctuaryInfo',
  ...dpsBaseUnitQuantityIds(),
  ...dpsBaseUnitSettingIds()
]);
function isTraitPresetExcludedValueId(id){
  return TRAIT_PRESET_EXCLUDED_VALUE_IDS.has(String(id || ''));
}
const TRAIT_PRESET_NAME_PLACEHOLDER='프리셋 이름 입력';
const TRAIT_PRESET_INVALID_FILE_MESSAGE='특성 프리셋 파일 형식이 아닙니다.';
const TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS=new Set([
  'diff','penance','round','soloMode','coopMode','coopPassenger2Dr','coopPassenger3Dr','team','pbless','spBankApply',
  'specDpsSpeedMode','dpsBaseUnitSpeedMode',PRESET_BATTLE_MODE_VALUE_ID,
  'overEnhance','repairEnhance','enhanceMaster',
  'prodArtifact','prodNova','prodTeratron','prodAmon','prodAdun','prodKerrigan','prodOvermind','prodNarud',
  'flowerSkill1','flowerSkill2','flowerSkill3'
]);
function isTraitPresetFileType(type){
  return String(type || '')===TRAIT_PRESET_FILE_TYPE;
}
function currentWebDpsVersion(){
  return String(window.DPS_BUILD_VERSION || window.APP_VERSION || STORAGE_VERSION || 'dev');
}
function padTraitPresetDatePart(value){return String(value).padStart(2,'0');}
function formatTraitPresetExportedAt(date=new Date()){
  return `${padTraitPresetDatePart(date.getFullYear()%100)}${padTraitPresetDatePart(date.getMonth()+1)}${padTraitPresetDatePart(date.getDate())}_${padTraitPresetDatePart(date.getHours())}${padTraitPresetDatePart(date.getMinutes())}${padTraitPresetDatePart(date.getSeconds())}`;
}
// 폐지된 필드는 구버전 가져오기·업데이트·백업에서 같은 규칙으로 제거한다.
const REMOVED_PRESET_VALUE_LABELS=Object.freeze({
  janRuneScope:'1월 적용 범위',
  janRuneNormal:'1월 일반',
  janRunePlus:'1월 강화'
});
const INTERNAL_VALUE_IDS=new Set([
  'dt','ep','rAP','rTD','rUA','rHarmony'
]);
const IGNORED_SAVED_VALUE_IDS=[...(DPS_CONFIG.state.skipElementIds || []),...INTERNAL_VALUE_IDS,...Object.keys(REMOVED_PRESET_VALUE_LABELS)];
const STORAGE_SKIP_ELEMENT_IDS=new Set(DPS_CONFIG.state.skipElementIds || []);
const NORMALIZED_MONEY_VALUE_IDS=new Set(['sp','xp','bxp','rp','soul']);
const SHARD_VALUE_IDS=new Set(['coralShard','aiurShard','xerusShard']);
function normalizeMoneyStorageValue(value, id=''){
  const digits=normalizedUnsignedDigits(value, '');
  if(id==='xp') return digits && !/^0+$/.test(digits) ? digits : '1';
  return digits || '0';
}
function normalizeShardStorageValue(value){
  return clampedIntegerString(value, 0, 9999, 0);
}
function normalizeShardStorageValues(values){
  if(!values || typeof values!=='object') return values;
  SHARD_VALUE_IDS.forEach(id=>{ values[id]=normalizeShardStorageValue(values[id]); });
  return values;
}
function normalizeMoneyStorageValues(values){
  if(!values || typeof values!=='object') return values;
  NORMALIZED_MONEY_VALUE_IDS.forEach(id=>{
    if(hasOwn(values,id)) values[id]=normalizeMoneyStorageValue(values[id], id);
  });
  return values;
}
function syncSpBankPresetState(values, inv){
  if(!values || typeof values!=='object' || !inv || typeof inv!=='object') return;
  const bankLevel=Math.max(0, Math.min(TMAX[SP_BANK_TRAIT_ROW]||999, Math.round(+(inv[SP_BANK_TRAIT_ROW]||0))));
  const applyState=hasOwn(values,'spBankApply') ? normalizeSpBankApplyValue(values.spBankApply) : '미반영';
  inv[SP_BANK_TRAIT_ROW]=bankLevel;
  values.spBankApply=applyState;
}
function isUserStateValueId(id){ return !hasOwn(REMOVED_PRESET_VALUE_LABELS,id) && (USER_STATE_VALUE_IDS.has(id) || id===PRESET_BATTLE_MODE_VALUE_ID); }
function userStateElementIds(){ return storageElementIds().filter(id=>USER_STATE_VALUE_IDS.has(id)); }
const storageState={isLoading:false,suppressSave:false,factoryState:null,saveFailCount:0,hasSavedState:false,presetMutationInProgress:false};
function isStorageLocked(){return storageState.isLoading || storageState.suppressSave;}
function storageElementIds(){
  return Array.from(qsa('input[id],select[id],textarea[id]'))
    .filter(el=>el.id && el.type!=='file' && !STORAGE_SKIP_ELEMENT_IDS.has(el.id))
    .map(el=>el.id);
}
function elementDefaultValue(el){
  if(el.tagName==='SELECT'){
    const selected=Array.from(el.options || []).find(opt=>opt.defaultSelected) || el.options?.[0];
    return selected ? selected.value : '';
  }
  if(el.type==='checkbox') return !!el.defaultChecked;
  if(el.type==='radio') return el.defaultChecked ? el.value : undefined;
  return el.defaultValue ?? '';
}
function normalizeStoredElementValue(id, value){
  if(id==='dpsBaseUnits') return normalizeDpsBaseUnitsValue(value);
  if(id==='dpsBaseUnitSlots') return serializeDpsBaseUnitSlots(value);
  if(id==='dpsJewelSettings') return serializeDpsJewelSettings(value);
  if(id==='dpsBaseUnitExtraSettings') return serializeDpsBaseUnitExtraSettings(value);
  if(id==='dpsBaseUnitSlotExpansions') return serializeDpsBaseUnitSlotExpansions(value);
  if(id==='specDpsSpeedMode' || id==='dpsBaseUnitSpeedMode') return normalizeOnOffValue(value,'OFF');
  if(id==='specBoardPierce') return normalizeSpecBoardPierceValue(value);
  if(id==='additionalRuneSlots') return normalizeAdditionalRuneSlotsValue(value);
  if(id==='donationBuffType') return normalizeDonationBuffType(value);
  if(DPS_BASE_UNIT_QUANTITY_IDS.has(id)) return normalizeDpsBaseUnitQuantityStorageValue(value);
  if(DPS_BASE_UNIT_ENHANCE_IDS.has(id)) return normalizeDpsBaseUnitEnhanceValue(value);
  if(DPS_BASE_UNIT_LIMIT_BREAK_IDS.has(id)) return normalizeDpsBaseUnitLimitBreakValue(value);
  if(DPS_BASE_UNIT_JEWEL_IDS.has(id)) return normalizeDpsJewelName(value);
  if(DPS_BASE_UNIT_VOID_POWER_IDS.has(id)) return normalizeDpsBaseUnitVoidPowerValue(value);
  if(SHARD_VALUE_IDS.has(id)) return normalizeShardStorageValue(value);
  if(NORMALIZED_MONEY_VALUE_IDS.has(id)) return normalizeMoneyStorageValue(value, id);
  return value;
}
function readElementValue(el){
  if(el.type==='checkbox') return !!el.checked;
  if(el.type==='radio') return el.checked ? el.value : undefined;
  if(EROSION_CONTROL_IDS.has(el.id)) return erosionStoredValue(el.id);
  if(el.id==='round') return targetRoundStoredValue();
  if(el.id==='challengeTowerFloor') return challengeTowerFloorStoredValue();
  if(el.id==='planetExplorationFloor') return planetExplorationFloorStoredValue();
  if(el.id==='penance') return penanceStoredValue();
  if(el.id==='diff' && isPlanetExplorationDifficulty(el.value)) return PLANET_EXPLORATION_STORAGE_NAME;
  return normalizeStoredElementValue(el.id, el.value);
}
function writeElementValue(el, value){
  if(el.id==='diff' && isPlanetExplorationDifficulty(value)) value=currentPlanetExplorationDifficulty();
  if(el.id==='spBankApply') value=normalizeSpBankApplyValue(value);
  if(el.id==='penance'){
    const stored=normalizePenanceValue(value, SOLO_PENANCE_MAX);
    el.dataset.penanceValue=stored;
    value=stored;
  }
  if(el.id==='round'){
    const stored=normalizedRoundString(value);
    el.dataset.roundValue=stored;
    value=stored;
  }
  if(el.id==='challengeTowerFloor'){
    const stored=normalizedTowerFloorString(value);
    el.dataset.challengeTowerFloorValue=stored;
    value=stored;
  }
  if(el.id==='planetExplorationFloor'){
    const stored=normalizedPlanetExplorationFloorString(value);
    el.dataset.planetExplorationFloorValue=stored;
    value=stored;
  }
  if(EROSION_CONTROL_IDS.has(el.id)){
    const stored=normalizeErosionControlValue(el.id, value);
    el.dataset.erosionValue=stored;
    value=stored;
  }
  if(el.id==='pbless'){
    value=normalizePowerBlessRawValue(value);
    syncPowerBlessOptions();
  }
  value=normalizeStoredElementValue(el.id, value);
  if(el.type==='checkbox') el.checked=!!value;
  else el.value=value;
  if(TRAIT_LIMIT_INPUT_IDS.has(el.id)) syncTraitLimitInputDisplay(el);
}
function getClientId(){
  try{
    let id=localStorage.getItem(CLIENT_KEY);
    if(id) return id;
    const seed=(typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now()+'_'+Math.random().toString(16).slice(2);
    id='dps_'+seed;
    localStorage.setItem(CLIENT_KEY,id);
    return id;
  }catch{ return 'dps_memory_only'; }
}

function makePublicDefaultState(){
  const values={};
  userStateElementIds().forEach(id=>{
    const el=$(id);
    if(el) values[id]=elementDefaultValue(el);
  });
  Object.assign(values,{optTier:values.optTier ?? '루키', utilOptTier:values.utilOptTier ?? '루키', [PRESET_BATTLE_MODE_VALUE_ID]:'normal'});
  Object.entries(TRAIT_LIMIT_DEFAULTS).forEach(([id,value])=>{ if(!hasOwn(values,id)) values[id]=value; });
  normalizeShardStorageValues(values);
  const inv={};
  TRAITS.forEach(t=>{ inv[t[0]]=0; });
  return makeStorageEnvelope({
    values,
    inv,
    zeroScore:collectZeroScoreState(),
    savedAt:0,
    scope:'public_default'
  });
}
function captureFactoryState(){ storageState.factoryState=makePublicDefaultState(); }
function canonicalDonationState(values,inv){
  const nextValues={...(values || {})};
  const nextInv={...(inv || {})};
  if(hasOwn(nextValues,'donationBuffType')) nextInv[116]=donationInvestmentFromType(nextValues.donationBuffType);
  else if(!hasOwn(nextInv,'116')) nextInv[116]=0;
  delete nextValues.donationBuffType;
  return {values:nextValues,inv:nextInv};
}
function makeStorageEnvelope(partial){
  const donation=canonicalDonationState(partial.values,partial.inv);
  return {
    schemaVersion:+partial.schemaVersion || APP_STATE_SCHEMA_VERSION,
    values:donation.values,
    inv:donation.inv,
    recommendations:partial.recommendations,
    zeroScore:partial.zeroScore ? normalizeZeroScoreState(partial.zeroScore) : undefined,
    savedAt:+partial.savedAt || Date.now(),
    storageVersion:partial.storageVersion || STORAGE_VERSION,
    scope:partial.scope || STORAGE_SCOPE,
    ui:partial.ui && typeof partial.ui==='object' ? partial.ui : {fontScale:DPS_CONFIG.ui.fontScaleDefault},
    clientId:partial.clientId || getClientId()
  };
}
function makeStateObject(){
  normalizeXpInput();
  const values={};
  userStateElementIds().forEach(id=>{
    const el=$(id);
    if(!el) return;
    let value=readElementValue(el);
    if(value!==undefined){
      if(id==='round') value=normalizedRoundString(value);
      if(id==='skillRound') value=normalizedSkillRoundString(value);
      if(id==='challengeTowerFloor') value=normalizedTowerFloorString(value);
      if(id==='planetExplorationFloor') value=normalizedPlanetExplorationFloorString(value);
      if(TRAIT_LIMIT_INPUT_IDS.has(id)) value=normalizeTraitLimitStorageValue(value);
      if(id==='spBankApply') value=normalizeSpBankApplyValue(value);
      values[id]=value;
    }
  });
  values.optTier=vs('optTier') || values.optTier || '루키';
  values.utilOptTier=vs('utilOptTier') || values.utilOptTier || '루키';
  values[PRESET_BATTLE_MODE_VALUE_ID]=isArtifactDpsViewEnabled() ? 'artifact' : 'normal';
  // 에디셔널은 룬 10칸만 저장한다. 표시되는 7개 평균값은 매번 계산한다.
  values.additionalRuneSlots=normalizeAdditionalRuneSlotsValue(vs('additionalRuneSlots'));
  Object.entries(TRAIT_LIMIT_DEFAULTS).forEach(([id,value])=>{ values[id]=vs(id) || values[id] || value; });
  if(hasOwn(values,'spBankApply')) values.spBankApply=normalizeSpBankApplyValue(values.spBankApply);
  TRAIT_LIMIT_INPUT_IDS.forEach(id=>{ values[id]=normalizeTraitLimitStorageValue(values[id] ?? TRAIT_LIMIT_DEFAULTS[id] ?? '0'); });
  const normalizedRune=normalizeRuneChoiceValues(values);
  values.runeChoiceType=normalizedRune.runeChoiceType;
  values.runeChoiceValue=normalizedRune.runeChoiceValue;
  normalizeShardStorageValues(values);
  normalizeMoneyStorageValues(values);
  const inv={...INV};
  syncSpBankPresetState(values, inv);
  return makeStorageEnvelope({
    values,
    inv,
    recommendations:traitRecommendationSaveState(),
    zeroScore:collectZeroScoreState(),
    savedAt:Date.now(),
    ui:{fontScale:getFontScale()}
  });
}
function savedTowerFloorValue(values={}){
  return normalizedTowerFloorString(values.challengeTowerFloor ?? TOWER_FLOOR_INPUT_MIN);
}
function sanitizeSavedValues(values){
  if(!values || typeof values!=='object') values={};
  const out=normalizeRuneChoiceValues(values);
  IGNORED_SAVED_VALUE_IDS.forEach(id=>delete out[id]);
  Object.keys(out).forEach(id=>{ if(!isUserStateValueId(id)) delete out[id]; });
  out[PRESET_BATTLE_MODE_VALUE_ID]=normalizePresetBattleMode(out[PRESET_BATTLE_MODE_VALUE_ID]);
  out.challengeTowerFloor=savedTowerFloorValue(out);
  if(hasOwn(out,'overEnhance')) out.overEnhance=String(normalizeOverEnhanceValue(out.overEnhance));
  const coopMode=normalizeOnOffValue(out.coopMode,'OFF')==='ON';
  out.soloMode=coopMode ? 'OFF' : 'ON';
  out.coopMode=coopMode ? 'ON' : 'OFF';
  out.coopPassenger2Dr=normalizeCoopPassengerDefenseReduceValue(out.coopPassenger2Dr);
  out.coopPassenger3Dr=normalizeCoopPassengerDefenseReduceValue(out.coopPassenger3Dr);
  if(hasOwn(out,'team')) out.team=normalizeTeamCountValue(out.team);
  if(hasOwn(out,'penance')) out.penance=normalizePenanceValue(out.penance, SOLO_PENANCE_MAX);
  if(hasOwn(out,'round')) out.round=normalizedRoundString(out.round);
  if(hasOwn(out,'skillRound')) out.skillRound=normalizedSkillRoundString(out.skillRound,out.skillMode ?? 'normal');
  if(hasOwn(out,'challengeTowerFloor')) out.challengeTowerFloor=normalizedTowerFloorString(out.challengeTowerFloor);
  if(hasOwn(out,'planetExplorationFloor')) out.planetExplorationFloor=normalizedPlanetExplorationFloorString(out.planetExplorationFloor);
  if(hasOwn(out,'pbless')) out.pbless=normalizePowerBlessRawValue(out.pbless);
  if(hasOwn(out,'spBankApply')) out.spBankApply=normalizeSpBankApplyValue(out.spBankApply);
  if(hasOwn(out,'specBoardPierce')) out.specBoardPierce=normalizeSpecBoardPierceValue(out.specBoardPierce);
  if(hasOwn(out,'additionalRuneSlots')) out.additionalRuneSlots=normalizeAdditionalRuneSlotsValue(out.additionalRuneSlots);
  out.dpsBaseUnits=normalizeDpsBaseUnitsValue(out.dpsBaseUnits ?? '');
  if(hasOwn(out,'dpsBaseUnitSlots')) out.dpsBaseUnitSlots=serializeDpsBaseUnitSlots(out.dpsBaseUnitSlots);
  if(hasOwn(out,'dpsJewelSettings')) out.dpsJewelSettings=serializeDpsJewelSettings(out.dpsJewelSettings);
  if(hasOwn(out,'dpsBaseUnitExtraSettings')) out.dpsBaseUnitExtraSettings=serializeDpsBaseUnitExtraSettings(out.dpsBaseUnitExtraSettings);
  if(hasOwn(out,'dpsBaseUnitSlotExpansions')) out.dpsBaseUnitSlotExpansions=serializeDpsBaseUnitSlotExpansions(out.dpsBaseUnitSlotExpansions);
  dpsBaseUnitQuantityIds().forEach(id=>{ if(hasOwn(out,id)) out[id]=normalizeDpsBaseUnitQuantityStorageValue(out[id]); });
  DPS_BASE_UNIT_ENHANCE_IDS.forEach(id=>{ if(hasOwn(out,id)) out[id]=normalizeDpsBaseUnitEnhanceValue(out[id]); });
  DPS_BASE_UNIT_LIMIT_BREAK_IDS.forEach(id=>{ if(hasOwn(out,id)) out[id]=normalizeDpsBaseUnitLimitBreakValue(out[id]); });
  DPS_BASE_UNIT_JEWEL_IDS.forEach(id=>{ if(hasOwn(out,id)) out[id]=normalizeDpsJewelName(out[id]); });
  DPS_BASE_UNIT_VOID_POWER_IDS.forEach(id=>{ if(hasOwn(out,id)) out[id]=normalizeDpsBaseUnitVoidPowerValue(out[id]); });
  delete out['spBank'+'BudgetMode'];
  delete out['dpsTable'+'MinDps'];
  if(hasOwn(out,'runeChoiceType') || hasOwn(out,'runeChoiceValue')){
    const normalizedRune=normalizeRuneChoiceValues(out);
    out.runeChoiceType=normalizedRune.runeChoiceType;
    out.runeChoiceValue=normalizedRune.runeChoiceValue;
  }
  TRAIT_LIMIT_INPUT_IDS.forEach(id=>{
    if(!hasOwn(out,id)) return;
    out[id]=normalizeTraitLimitStorageValue(out[id]);
  });
  normalizeShardStorageValues(out);
  normalizeMoneyStorageValues(out);
  return out;
}

function makeNormalizedStateEnvelope(source,values,inv,{requireRawValues=false,requireContent=true}={}){
  const hasRawValues=Object.keys(source?.values || {}).some(id=>isUserStateValueId(id));
  const hasZeroScore=!!(source?.zeroScore && Array.isArray(source.zeroScore.rows));
  if(requireRawValues && !hasRawValues && !Object.keys(inv).length && !hasZeroScore) return null;
  if(requireContent && !Object.keys(values).length && !Object.keys(inv).length && !hasZeroScore) return null;
  return makeStorageEnvelope({
    values,
    inv,
    zeroScore:source.zeroScore,
    recommendations:source.recommendations,
    savedAt:source.savedAt,
    storageVersion:source.storageVersion,
    scope:source.scope,
    ui:source.ui,
    clientId:source.clientId
  });
}
function normalizeSavedState(data){
  if(!data || typeof data!=='object') return null;
  const sourceValues=(data.values && typeof data.values==='object') ? data.values : {};
  const donation=canonicalDonationState(sourceValues,data.inv);
  const values=sanitizeSavedValues(donation.values);
  const inv=donation.inv;
  syncSpBankPresetState(values, inv);
  return makeNormalizedStateEnvelope(data,values,inv,{requireRawValues:true,requireContent:false});
}

function sanitizeTraitPresetValues(values){
  const out={...sanitizeSavedValues(values)};
  Object.keys(out).forEach(id=>{
    if(isTraitPresetExcludedValueId(id)) delete out[id];
  });
  return out;
}
function makeTraitPresetStateEnvelope(source,values,inv){
  const out=canonicalDonationState(values,inv);
  if(source?.zeroScore) out.zeroScore=normalizeZeroScoreState(source.zeroScore);
  return out;
}
function normalizeTraitPresetState(data){
  const normalized=normalizeSavedState(data);
  if(!normalized) return null;
  const values=sanitizeTraitPresetValues(normalized.values);
  const inv={...normalized.inv};
  syncSpBankPresetState(values, inv);
  return makeTraitPresetStateEnvelope(normalized,values,inv);
}
function makeTraitPresetStateObject(sourceState=makeStateObject()){
  return normalizeTraitPresetState(sourceState);
}

/* ── 02 · 유닛 상태 ── */
/* 유닛 보드 프리셋 상태 */
function normalizeTraitPresetUnitBoardState(value){
  const source=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const usedUnits=new Set();
  const usedSlots=new Set();
  const units=[];
  (Array.isArray(source.units) ? source.units : []).forEach((item,index)=>{
    if(!item || typeof item!=='object') return;
    const unitId=String(item.unitId || '').trim();
    const unit=dpsBaseUnitById(unitId);
    if(!unit || usedUnits.has(unitId)) return;
    let slot=Math.max(0,Math.min(dpsBaseUnitSelectionLimit()-1,Math.round(Number(item.slot ?? index)||0)));
    while(usedSlots.has(slot) && slot<dpsBaseUnitSelectionLimit()-1) slot++;
    if(usedSlots.has(slot)) slot=Array.from({length:dpsBaseUnitSelectionLimit()},(_,i)=>i).find(i=>!usedSlots.has(i));
    if(slot===undefined) return;
    usedUnits.add(unitId);
    usedSlots.add(slot);
    const quantity=dpsBaseUnitHasQuantity(unit)
      ? Math.max(1,Number(normalizeDpsBaseUnitQuantityStorageValue(item.quantity ?? 1))||1)
      : 1;
    const supportsAdvancedOptions=dpsBaseUnitSupportsAdvancedOptions(unit);
    units.push({
      unitId,
      slot,
      quantity,
      enhanceExpected:Number(normalizeDpsBaseUnitEnhanceValue(item.enhanceExpected ?? 0))||0,
      limitBreak:supportsAdvancedOptions ? Number(normalizeDpsBaseUnitLimitBreakValue(item.limitBreak ?? 0))||0 : 0,
      voidPower:supportsAdvancedOptions ? normalizeDpsBaseUnitVoidPowerValue(item.voidPower) : 'OFF',
      legendaryMythicJewel:supportsAdvancedOptions ? normalizeDpsJewelName(item.legendaryMythicJewel ?? '') : ''
    });
  });
  units.sort((a,b)=>a.slot-b.slot);
  const selectedUnitIds=new Set(units.map(item=>item.unitId));
  units.forEach(item=>{ if(item.unitId==='prodNarud') item.voidPower='OFF'; });
  const slotExpansions=normalizeDpsBaseUnitSlotExpansions(source.slotExpansions || [])
    .filter(unitId=>selectedUnitIds.has(unitId));
  const normalizedExtras=normalizeDpsBaseUnitExtraSettings(source.additionalUnitSettings || {});
  const additionalUnitSettings=Object.fromEntries(Object.entries(normalizedExtras).filter(([unitId])=>selectedUnitIds.has(unitId)));
  const usedLegendaryJewels=new Set();
  units.forEach(item=>{
    const name=normalizeDpsJewelName(item.legendaryMythicJewel);
    item.legendaryMythicJewel=name && !usedLegendaryJewels.has(name) ? name : '';
    if(item.legendaryMythicJewel) usedLegendaryJewels.add(item.legendaryMythicJewel);
    const extras=additionalUnitSettings[item.unitId];
    if(!Array.isArray(extras)) return;
    extras.forEach(extra=>{
      const extraName=normalizeDpsJewelName(extra.legendaryMythicJewel);
      extra.legendaryMythicJewel=extraName && !usedLegendaryJewels.has(extraName) ? extraName : '';
      if(extra.legendaryMythicJewel) usedLegendaryJewels.add(extra.legendaryMythicJewel);
    });
  });
  // 과거 빈 슬롯 개수는 표시 수에 반영하지 않는다. 설정된 유닛 수만 저장한다.
  const visibleSlotCount=units.length;
  return {
    units,
    visibleSlotCount,
    slotExpansions,
    additionalUnitSettings:normalizeDpsBaseUnitExtraSettings(additionalUnitSettings),
    sanctuaryInfo:normalizeDpsSanctuaryInfo(source.sanctuaryInfo)
  };
}
function captureTraitPresetUnitBoardState(){
  ensureDpsBaseUnitStore();
  const units=currentDpsBaseUnitSlots().map((unitId,slot)=>{
    const unit=dpsBaseUnitById(unitId);
    if(!unit) return null;
    const supportsAdvancedOptions=dpsBaseUnitSupportsAdvancedOptions(unit);
    return {
      unitId,
      slot,
      quantity:dpsBaseUnitHasQuantity(unit) ? Number(normalizeDpsBaseUnitQuantityValue(dpsBaseUnitStoreInput('quantity',unit)?.value || 1)) : 1,
      enhanceExpected:Number(normalizeDpsBaseUnitEnhanceValue(dpsBaseUnitStoreInput('enhance',unit)?.value || 0))||0,
      limitBreak:supportsAdvancedOptions ? Number(normalizeDpsBaseUnitLimitBreakValue(dpsBaseUnitStoreInput('limitBreak',unit)?.value || 0))||0 : 0,
      voidPower:supportsAdvancedOptions ? normalizeDpsBaseUnitVoidPowerValue(dpsBaseUnitStoreInput('voidPower',unit)?.value) : 'OFF',
      legendaryMythicJewel:supportsAdvancedOptions ? normalizeDpsJewelName(dpsBaseUnitStoreInput('jewel',unit)?.value) : ''
    };
  }).filter(Boolean);
  const selectedIds=new Set(units.map(item=>item.unitId));
  const extras=normalizeDpsBaseUnitExtraSettings($('dpsBaseUnitExtraSettings')?.value || '{}');
  const selectedExtras=Object.fromEntries(Object.entries(extras).filter(([unitId])=>selectedIds.has(unitId)));
  return normalizeTraitPresetUnitBoardState({
    units,
    visibleSlotCount:dpsUnitVisibleCount(currentDpsBaseUnitSlots()),
    slotExpansions:dpsBaseUnitSlotExpansionIds().filter(unitId=>selectedIds.has(unitId)),
    additionalUnitSettings:selectedExtras,
    sanctuaryInfo:currentDpsSanctuaryInfo()
  });
}
function writeTraitPresetUnitBoardStoreValues(unit,values={}){
  const assignments=[
    ['enhance',normalizeDpsBaseUnitEnhanceValue(values.enhanceExpected)],
    ['limitBreak',normalizeDpsBaseUnitLimitBreakValue(values.limitBreak)],
    ['jewel',normalizeDpsJewelName(values.legendaryMythicJewel)],
    ['voidPower',normalizeDpsBaseUnitVoidPowerValue(values.voidPower)]
  ];
  if(dpsBaseUnitHasQuantity(unit)) assignments.unshift(['quantity',normalizeDpsBaseUnitQuantityValue(values.quantity)]);
  assignments.forEach(([field,value])=>{
    const input=dpsBaseUnitStoreInput(field,unit);
    if(input) input.value=value;
  });
}
function applyTraitPresetUnitBoardState(value,options={}){
  const state=normalizeTraitPresetUnitBoardState(value);
  // 저장된 프리셋에는 자동 생성 직후의 임시 UI 안내를 넘기지 않는다.
  if(typeof dpsUnitAutoNarudReviewSlot!=='undefined') dpsUnitAutoNarudReviewSlot=-1;
  ensureDpsBaseUnitStore();
  const extraStore=$('dpsBaseUnitExtraSettings');
  const expansionStore=$('dpsBaseUnitSlotExpansions');
  if(extraStore) extraStore.value=serializeDpsBaseUnitExtraSettings(state.additionalUnitSettings);
  if(expansionStore) expansionStore.value=serializeDpsBaseUnitSlotExpansions(state.slotExpansions);
  const sanctuaryStore=$('dpsSanctuaryInfo');
  if(sanctuaryStore) sanctuaryStore.value=JSON.stringify(state.sanctuaryInfo);
  dpsBaseUnitList().forEach(unit=>writeTraitPresetUnitBoardStoreValues(unit));
  const slots=emptyDpsBaseUnitSlots();
  state.units.forEach(item=>{
    const unit=dpsBaseUnitById(item.unitId);
    if(!unit) return;
    slots[item.slot]=item.unitId;
    writeTraitPresetUnitBoardStoreValues(unit,item);
  });
  // The preset, never the previous unsaved editing session, owns the visible slot count.
  const visibleCountInput=$('dpsBaseUnitVisibleSlotCount');
  if(visibleCountInput) visibleCountInput.value=String(state.visibleSlotCount);
  setDpsBaseUnitStoredValue(slots.filter(Boolean),false,{slots});
  renderDpsSanctuaryInfo();
  if(options.recalculate!==false) recalc({save:options.save});
  return state;
}
/* ── 03 · 쥬얼·보드 설정 ── */
/* 프리셋 쥬얼 상태 및 유닛 보드 설정 */
function normalizeTraitPresetJewelSettings(value){
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const legendarySource=value.legendaryMythicJewels;
  if(legendarySource===undefined) return null;
  return {
    legendaryMythicJewels:normalizeDpsJewelSettings(legendarySource || {})
  };
}
function captureTraitPresetJewelSettings(){
  return normalizeTraitPresetJewelSettings({legendaryMythicJewels:dpsJewelSettingsObject()});
}
function applyTraitPresetJewelSettings(value){
  const settings=normalizeTraitPresetJewelSettings(value);
  if(!settings) return null;
  const legendaryStore=$('dpsJewelSettings');
  if(legendaryStore) legendaryStore.value=serializeDpsJewelSettings(settings.legendaryMythicJewels);
  sanitizeDpsJewelSelections();
  renderDpsJewelConfigGrids();
  return settings;
}
function emptyTraitPresetUnitBoardStore(){
  return {presets:{}};
}
function normalizeTraitPresetUnitBoardStore(value,validPresetIds=[]){
  const requestedIds=[...new Set(validPresetIds.map(id=>String(id || '')).filter(Boolean))];
  const validIds=new Set(requestedIds);
  const source=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const sourcePresets=source.presets && typeof source.presets==='object' && !Array.isArray(source.presets) ? source.presets : {};
  const presets={};
  Object.entries(sourcePresets).forEach(([presetId,state])=>{
    const id=String(presetId || '');
    if(!id || (validIds.size && !validIds.has(id))) return;
    presets[id]=normalizeTraitPresetUnitBoardState(state);
  });
  return {presets};
}
function traitPresetHasUnitBoard(store,presetId){
  return !!(store?.unitBoard?.presets && hasOwn(store.unitBoard.presets,String(presetId || '')));
}
function traitPresetUnitBoardState(store,presetId){
  return traitPresetHasUnitBoard(store,presetId) ? normalizeTraitPresetUnitBoardState(store.unitBoard.presets[String(presetId || '')]) : null;
}
function setTraitPresetUnitBoardState(store,presetId,state){
  const out=store && typeof store==='object' ? store : emptyTraitPresetStore();
  const validIds=(out.presets || []).map(preset=>preset.id);
  out.unitBoard=normalizeTraitPresetUnitBoardStore(out.unitBoard,validIds);
  out.unitBoard.presets[String(presetId || '')]=normalizeTraitPresetUnitBoardState(state);
  return out;
}
function deleteTraitPresetUnitBoardState(store,presetId){
  if(store?.unitBoard?.presets) delete store.unitBoard.presets[String(presetId || '')];
  return store;
}
function resetTraitPresetUnitBoardValues(values){
  const out={...(values || {})};
  out.dpsBaseUnits='';
  out.dpsBaseUnitSlots='';
  dpsBaseUnitQuantityIds().forEach(id=>{ out[id]='0'; });
  DPS_BASE_UNIT_ENHANCE_IDS.forEach(id=>{ out[id]='0'; });
  DPS_BASE_UNIT_LIMIT_BREAK_IDS.forEach(id=>{ out[id]='0'; });
  DPS_BASE_UNIT_JEWEL_IDS.forEach(id=>{ out[id]=''; });
  DPS_BASE_UNIT_VOID_POWER_IDS.forEach(id=>{ out[id]='OFF'; });
  out.dpsBaseUnitExtraSettings='{}';
  return out;
}
/* ── 04 · 상태 병합·적용 ── */
/* 프리셋 상태 병합·화면 적용 */
function mergeTraitPresetWithLocalState(presetState, localState, options={}){
  const preset=normalizeTraitPresetState(presetState);
  if(!preset) return null;
  const local=normalizeSavedState(localState) || makePublicDefaultState();
  let values=options.preserveSharedValues===true
    ? {...preset.values, ...local.values}
    : {...local.values, ...preset.values};
  values=resetTraitPresetUnitBoardValues(values);
  // 룬 데이터가 없는 프리셋에 이전 편집 세션의 룬 입력을 상속하지 않는다.
  values.additionalRuneSlots=preset.values.additionalRuneSlots ?? '[]';
  // 전투 모드는 공통 설정 유지 여부와 무관하게 해당 프리셋의 값으로 복원한다.
  values[PRESET_BATTLE_MODE_VALUE_ID]=normalizePresetBattleMode(preset.values[PRESET_BATTLE_MODE_VALUE_ID]);
  return makeStorageEnvelope({
    values,
    inv:{...preset.inv,116:options.preserveSharedValues===true ? local.inv[116] : preset.inv[116]},
    zeroScore:preset.zeroScore,
    savedAt:local.savedAt || Date.now(),
    storageVersion:local.storageVersion,
    scope:local.scope,
    ui:local.ui,
    clientId:local.clientId
  });
}
function buildTraitPresetApplyState(preset, options={}){
  return mergeTraitPresetWithLocalState(preset?.state, makeStateObject(), options);
}
function applyStateObject(data, options={}){
  if(!data) return;
  storageState.isLoading=true;
  try{
    // 프리셋 복원 시 공통 넥서스 글씨 크기 설정은 변경하지 않는다.
    const donation=canonicalDonationState(data.values,data.inv);
    const sanitizedValues=sanitizeSavedValues(donation.values);
    setArtifactDpsViewEnabled(false);
    syncDifficultyOptions({restoreAll:true});
    const teamSelect=$('team');
    if(teamSelect){
      delete teamSelect.dataset.personalTeamValue;
      delete teamSelect.dataset.coopTeamValue;
      teamSelect.value='';
    }
    if(!hasOwn(sanitizedValues,'dpsBaseUnitSlots')){
      const slotInput=$('dpsBaseUnitSlots');
      if(slotInput) slotInput.value='';
    }
    if(hasOwn(sanitizedValues,'enhanceMaster')){
      const masterEl=$('enhanceMaster');
      if(masterEl) writeElementValue(masterEl, sanitizedValues.enhanceMaster);
    }
    // 프리셋을 바꿀 때 이전 룬 입력이 남지 않게 초기화한다.
    if(!hasOwn(sanitizedValues,'additionalRuneSlots')) $('additionalRuneSlots').value='[]';
    Object.entries(sanitizedValues).forEach(([id,val])=>{
      if(id==='team') return;
      const el=$(id);
      if(el) writeElementValue(el,val);
    });
    syncAdditionalAverage();
    syncBattleMode();
    if(teamSelect && hasOwn(sanitizedValues,'team')) writeElementValue(teamSelect,sanitizedValues.team);
    syncTeamSelect({preserveCurrent:true});
    syncDifficultyTargetControls();
    setArtifactDpsViewEnabled(sanitizedValues[PRESET_BATTLE_MODE_VALUE_ID]==='artifact');
    normalizeRoundInput('skillRound');
    syncPowerBlessOptions();
    normalizeXpInput();
    syncAutoEP();
    Object.keys(INV).forEach(k=>{ INV[k]=0; });
    Object.entries(donation.inv).forEach(([row,val])=>{
      const r=+row;
      if(!Number.isFinite(r) || !(r in INV)) return;
      INV[r]=Math.max(0, Math.min(TMAX[r]||999, Math.round(+val||0)));
    });
    // 프리셋에는 보유 재화보다 큰 투자값도 그대로 보존한다. 잔여량은 음수로 표시한다.
    restoreTraitRecommendationSaveState(data.recommendations);
    if(hasOwn(sanitizedValues,'runeChoiceType') || hasOwn(sanitizedValues,'runeChoiceValue')) syncRuneChoice();
    else hydrateRuneChoiceFromHidden();
    applyZeroScoreState(data.zeroScore ? normalizeZeroScoreState(data.zeroScore) : data.zeroScore);
    syncEnchantCodeFromInputs(true);
    syncControlDisplays();
    syncDpsBaseUnitControl();
    if(options.recalculate!==false) recalc({save:options.save});
  }finally{ storageState.isLoading=false; }
}
function resetToFactoryState(){
  if(!storageState.factoryState) captureFactoryState();
  applyStateObject(storageState.factoryState);
}
function safeJsonParse(raw){
  const text=String(raw??'').replace(/^\uFEFF/,'').trim();
  if(!text) return null;
  const attempts=[text];
  const first=text.indexOf('{'), last=text.lastIndexOf('}');
  if(first>=0 && last>first) attempts.push(text.slice(first,last+1));
  for(const item of attempts){
    try{return JSON.parse(item);}catch(error){
      if(item===attempts[attempts.length-1]) rememberAppIssue('warn','JSON 파싱',error);
    }
  }
  return null;
}
const TRAIT_PRESET_STATUS_STORAGE_KEY=DPS_CONFIG.storage.traitPresetStatusKey || 'gbd_dps_calculator:trait_preset_status';
const TRAIT_PRESET_DRAFT_STORAGE_KEY=DPS_CONFIG.storage.traitPresetDraftKey || 'gbd_dps_calculator:trait_preset_drafts';
function emptyTraitPresetStatusData(){
  return {updatedPresetIds:[],backupNeeded:false,lastAction:'latest',selectedTraitPresetId:'',pendingJewelSettings:false,pendingUnitBoardPresetIds:[],pendingCommonPresetIds:[],pendingCommonChangeKeys:[],pendingSingleChangeKeysByPreset:{},pendingChangeDetails:[]};
}
const TRAIT_PRESET_OBSOLETE_SANCTUARY_CHANGE_KEY='value:dpsSanctuaryInfo';
function normalizeTraitPresetStatusData(data){
  const base=emptyTraitPresetStatusData();
  if(!data || typeof data!=='object' || Array.isArray(data)) return base;
  const uniqueStrings=values=>Array.isArray(values)
    ? [...new Set(values.map(value=>String(value || '').trim()).filter(Boolean))] : [];
  let updatedPresetIds=uniqueStrings(data.updatedPresetIds);
  let backupNeeded=data.backupNeeded===true || updatedPresetIds.length>0;
  const lastAction=String(data.lastAction || base.lastAction || 'latest');
  const selectedTraitPresetId=String(data.selectedTraitPresetId || '').trim();
  const pendingJewelSettings=data.pendingJewelSettings===true;
  const pendingUnitBoardPresetIds=uniqueStrings(data.pendingUnitBoardPresetIds);
  const pendingCommonChangeKeys=uniqueStrings(data.pendingCommonChangeKeys).filter(key=>key!==TRAIT_PRESET_OBSOLETE_SANCTUARY_CHANGE_KEY);
  let pendingCommonPresetIds=uniqueStrings(data.pendingCommonPresetIds);
  const pendingSingleChangeKeysByPreset={};
  const byPreset=data.pendingSingleChangeKeysByPreset;
  if(byPreset && typeof byPreset==='object' && !Array.isArray(byPreset)){
    Object.entries(byPreset).forEach(([id,keys])=>{
      const presetId=String(id || '').trim();
      if(presetId && Array.isArray(keys)){
        const normalized=uniqueStrings(keys).filter(key=>key!==TRAIT_PRESET_OBSOLETE_SANCTUARY_CHANGE_KEY);
        if(normalized.length) pendingSingleChangeKeysByPreset[presetId]=normalized;
      }
    });
  }
  const pendingChangeDetails=Array.isArray(data.pendingChangeDetails) ? data.pendingChangeDetails.filter(row=>
    row && typeof row==='object' && typeof row.key==='string' && typeof row.presetId==='string' &&
    (row.scope==='common' || row.scope==='single') && row.key!==TRAIT_PRESET_OBSOLETE_SANCTUARY_CHANGE_KEY && typeof row.before==='string' && typeof row.after==='string'
  ).slice(0,800).map(row=>({presetId:row.presetId,key:row.key,scope:row.scope,before:row.before,after:row.after,...(typeof row.label==='string' ? {label:row.label.slice(0,160)} : {})})) : [];
  // V48에서 성소 정보만 공통 변경으로 기록된 과거 상태는 공통 변경 표시를 제거한다.
  // 다른 공통 변경 또는 개별 변경이 있으면 그 증거와 해당 프리셋의 백업 상태를 보존한다.
  const obsoleteOnly=uniqueStrings(data.pendingCommonChangeKeys).length===1 &&
    uniqueStrings(data.pendingCommonChangeKeys)[0]===TRAIT_PRESET_OBSOLETE_SANCTUARY_CHANGE_KEY &&
    !pendingJewelSettings && !pendingChangeDetails.some(row=>row.scope==='common');
  if(obsoleteOnly){
    pendingCommonPresetIds=[];
    const independentIds=new Set([...pendingUnitBoardPresetIds,...Object.keys(pendingSingleChangeKeysByPreset),
      ...pendingChangeDetails.filter(row=>row.scope==='single').map(row=>row.presetId)]);
    updatedPresetIds=updatedPresetIds.filter(id=>independentIds.has(id));
    backupNeeded=updatedPresetIds.length>0 || independentIds.size>0;
  }
  return {updatedPresetIds,backupNeeded,lastAction,selectedTraitPresetId,pendingJewelSettings,pendingUnitBoardPresetIds,pendingCommonPresetIds,pendingCommonChangeKeys,pendingSingleChangeKeysByPreset,pendingChangeDetails};
}
/* ── 05 · 저장 상태 ── */
/* 프리셋 상태 */
function loadTraitPresetStatusData(){
  try{
    const raw=localStorage.getItem(TRAIT_PRESET_STATUS_STORAGE_KEY);
    if(!raw) return emptyTraitPresetStatusData();
    const parsed=safeJsonParse(raw);
    if(parsed && typeof parsed==='object') return normalizeTraitPresetStatusData(parsed);
  }catch(error){
    rememberAppIssue('warn','프리셋 상태 불러오기', error);
  }
  return emptyTraitPresetStatusData();
}
function saveTraitPresetStatusData(data){
  const normalized=normalizeTraitPresetStatusData(data);
  try{ localStorage.setItem(TRAIT_PRESET_STATUS_STORAGE_KEY, JSON.stringify(normalized)); }
  catch(error){
    if(storageState.presetMutationInProgress) throw error;
    rememberAppIssue('warn','프리셋 상태 저장', error);
  }
  return normalized;
}
function cleanTraitPresetFileBaseName(value=''){
  return String(value ?? '')
    .replace(/\.[Tt][Xx][Tt]$/,'')
    .replace(/[\\/:*?"<>|]/g,'_')
    .replace(/\p{Cc}/gu,'')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/[. ]+$/,'')
    .slice(0,80);
}
function currentTraitPresetStatusData(partial={}){
  const status=normalizeTraitPresetStatusData({...loadTraitPresetStatusData(), ...partial});
  const store=loadTraitPresetStore();
  const validIds=new Set(store.presets.map(preset=>preset.id));
  status.updatedPresetIds=status.updatedPresetIds.filter(id=>validIds.has(id));
  status.pendingUnitBoardPresetIds=status.pendingUnitBoardPresetIds.filter(id=>validIds.has(id));
  status.pendingCommonPresetIds=status.pendingCommonPresetIds.filter(id=>validIds.has(id));
  status.pendingSingleChangeKeysByPreset=Object.fromEntries(Object.entries(status.pendingSingleChangeKeysByPreset).filter(([id])=>validIds.has(id)));
  status.pendingChangeDetails=status.pendingChangeDetails.filter(row=>row.scope==='common' || validIds.has(row.presetId));
  if(status.selectedTraitPresetId && !validIds.has(status.selectedTraitPresetId)) status.selectedTraitPresetId='';
  status.pendingCommonChangeKeys=[...new Set(status.pendingCommonChangeKeys.map(key=>String(key || '').trim()).filter(Boolean))];
  return {status,store};
}
/* 데이터 스키마 변경만 필수 업데이트로 안내한다. 일반 수치 변경 비교는 로드 확인·수동 업데이트에만 사용한다. */
function storedTraitPresetCompatibility(){
  try{
    const raw=localStorage.getItem(TRAIT_PRESET_STORAGE_KEY);
    if(!raw) return {requiresUpdate:false,error:''};
    const parsed=safeJsonParse(raw);
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed) || !Array.isArray(parsed.presets)){
      return {requiresUpdate:false,error:'프리셋 데이터 형식을 확인할 수 없습니다. 기존 데이터를 보존합니다. JSON 형식을 점검해 주세요.'};
    }
    if(parsed.type && !isTraitPresetFileType(parsed.type)){
      return {requiresUpdate:false,error:'지원하지 않는 프리셋 파일 형식입니다. 기존 데이터를 안전하게 보존합니다.'};
    }
    const result=inspectTraitPresetImportCompatibility(parsed);
    const needsNormalization=parsed.presets.some(preset=>{
      const board=parsed.unitBoard?.presets?.[preset.id];
      return board && hasOwn(board,'visibleSlotCount') && board.visibleSlotCount!==normalizeTraitPresetUnitBoardState(board).visibleSlotCount;
    });
    return {requiresUpdate:parsed.presets.length>0 && (result.requiresUpdate || needsNormalization),issues:result.issues,error:''};
  }catch(error){
    return {requiresUpdate:false,error:error?.message || '프리셋 데이터 형식을 확인할 수 없습니다.'};
  }
}
function requireCompatibleTraitPreset(compatibility){
  if(compatibility.error || compatibility.requiresUpdate) throw new Error(compatibility.error || '백업 버튼에서 프리셋 최신화를 먼저 완료해 주세요.');
}
function setTraitPresetActionDisplay(action,state){
  qsa(`[data-action="${action}"]`).forEach(btn=>{
    if(btn.classList.contains('preset-command')) btn.dataset.state=state;
  });
}
function renderTraitPresetStatus(status,store){
  const backup=store.presets.length>0 && (status.backupNeeded || status.updatedPresetIds.length>0 || status.pendingUnitBoardPresetIds.length>0);
  setTraitPresetActionDisplay('backupTraitPresets',store.presets.length ? (backup?'pending':'done'):'idle');
  renderTraitPresetUpdateStatus(store,status);
}
function updateTraitPresetStatus(partial={}, options={}){
  const {status,store}=currentTraitPresetStatusData(partial);
  renderTraitPresetStatus(status,store);
  if(options.persist) saveTraitPresetStatusData(status);
}
function restoreTraitPresetStatus(){
  const store=loadTraitPresetStore();
  updateTraitPresetStatus({pendingJewelSettings:store.presets.length>0 && traitPresetJewelSettingsChanged(store)}, {persist:true});
}
function markTraitPresetUpdated(ids, action='update', options={}){
  const previous=loadTraitPresetStatusData();
  // 구버전 가져오기에서는 전체 프리셋이 저장값 변경으로 잘못 기록됐으므로 새 작업에 섞지 않는다.
  if(previous.lastAction==='import' && !previous.pendingCommonChangeKeys.length &&
    Object.values(previous.pendingSingleChangeKeysByPreset).every(keys=>keys.length===1 && keys[0]==='storedPreset')){
    previous.updatedPresetIds=[];
    previous.pendingSingleChangeKeysByPreset={};
  }
  const normalizedIds=Array.isArray(ids) ? ids.map(id=>String(id || '').trim()).filter(Boolean) : [];
  const updatedPresetIds=[...new Set([...previous.updatedPresetIds, ...normalizedIds])];
  const pendingUnitBoardPresetIds=options.unitBoard===true
    ? [...new Set([...previous.pendingUnitBoardPresetIds, ...normalizedIds])]
    : previous.pendingUnitBoardPresetIds;
  const optionCommonKeys=Array.isArray(options.commonChangeKeys) ? options.commonChangeKeys : [];
  const optionSingleKeys=Array.isArray(options.singleChangeKeys) ? options.singleChangeKeys : [];
  const optionSingleByPreset=options.singleChangeKeysByPreset && typeof options.singleChangeKeysByPreset==='object' ? options.singleChangeKeysByPreset : {};
  const commonIds=Array.isArray(options.commonPresetIds) ? options.commonPresetIds : (optionCommonKeys.length ? normalizedIds : []);
  const explicitSingleIds=Array.isArray(options.singlePresetIds) ? options.singlePresetIds : null;
  const singleIds=explicitSingleIds || (optionSingleKeys.length || !optionCommonKeys.length ? normalizedIds : []);
  const targetedSingleIds=[...new Set([...singleIds, ...Object.keys(optionSingleByPreset)])];
  const pendingCommonPresetIds=[...new Set([...previous.pendingCommonPresetIds, ...commonIds].map(id=>String(id || '').trim()).filter(Boolean))];
  const unitBoardKeys=options.unitBoard===true ? ['unitBoard'] : [];
  const singleKeys=[...new Set([...optionSingleKeys, ...unitBoardKeys].map(key=>String(key || '').trim()).filter(Boolean))];
  if(!singleKeys.length && singleIds.length && !Object.keys(optionSingleByPreset).length) singleKeys.push('storedPreset');
  const pendingSingleChangeKeysByPreset={...previous.pendingSingleChangeKeysByPreset};
  targetedSingleIds.forEach(id=>{
    const presetId=String(id || '').trim();
    const specific=Array.isArray(optionSingleByPreset[presetId]) ? optionSingleByPreset[presetId] : [];
    if(presetId) pendingSingleChangeKeysByPreset[presetId]=[...new Set([...(pendingSingleChangeKeysByPreset[presetId] || []), ...singleKeys, ...specific])];
  });
  const pendingCommonChangeKeys=[...new Set([...previous.pendingCommonChangeKeys, ...optionCommonKeys].map(key=>String(key || '').trim()).filter(Boolean))];
  const pendingChangeDetails=mergeTraitPresetChangeDetails(previous.pendingChangeDetails,[
    ...(options.beforeStore && options.afterStore ? traitPresetChangeDetailsForStores(options.beforeStore,options.afterStore) : []),
    ...(options.changeDetails || [])
  ]);
  updateTraitPresetStatus({updatedPresetIds,pendingUnitBoardPresetIds,pendingCommonPresetIds,pendingCommonChangeKeys,pendingSingleChangeKeysByPreset,pendingChangeDetails,backupNeeded:true,lastAction:action},{persist:true});
}
function clearTraitPresetUpdatedStatus(action='latest',options={}){
  const partial={updatedPresetIds:[],backupNeeded:false,lastAction:action};
  if(options.keepPending!==true){
    partial.pendingJewelSettings=false;
    partial.pendingUnitBoardPresetIds=[];
    partial.pendingCommonPresetIds=[];
    partial.pendingCommonChangeKeys=[];
    partial.pendingSingleChangeKeysByPreset={};
    partial.pendingChangeDetails=[];
  }
  updateTraitPresetStatus(partial,{persist:true});
}
function traitPresetJewelSettingsChanged(store){
  const stored=normalizeTraitPresetJewelSettings(store.jewelSettings);
  const current=captureTraitPresetJewelSettings();
  return !stored || stableTraitPresetValue(stored)!==stableTraitPresetValue(current);
}
function markTraitPresetJewelSettingsPending(){
  const store=loadTraitPresetStore();
  updateTraitPresetStatus({pendingJewelSettings:traitPresetJewelSettingsChanged(store),lastAction:'edit'},{persist:true});
}
function notifyStorageAction(message, type='ok', options={}){
  if(type==='ok'&&options.statusAction&&!options.skipHeaderStatus){
    updateTraitPresetStatus({lastAction:options.statusAction},{persist:true});
  }
  if(type!=='ok'||options.toast===true) showToast(message,type,options.durationMs);
}
let autoSaveTimer=0;
function cancelScheduledAutoSave(){
  if(autoSaveTimer){
    clearTimeout(autoSaveTimer);
    autoSaveTimer=0;
  }
}
function scheduleAutoSave(){
  if(isStorageLocked() || (typeof dpsUnitSlotDraft!=='undefined' && dpsUnitSlotDraft)) return;
  cancelScheduledAutoSave();
  autoSaveTimer=setTimeout(()=>{
    autoSaveTimer=0;
    saveState({silent:true});
  },550);
}
function notifyTraitPresetBackupComplete(){
  clearTraitPresetUpdatedStatus('backup');
  refreshTraitPresetControls(selectedTraitPresetId());
}
function saveState(options={}){
  const silent=!!options.silent;
  if(isStorageLocked() || (typeof dpsUnitSlotDraft!=='undefined' && dpsUnitSlotDraft)) return false;
  try{
    const state=options.state && typeof options.state==='object' ? options.state : makeStateObject();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageState.hasSavedState=true;
    storageState.saveFailCount=0;
    if(!silent) notifyStorageAction('입력값 저장 완료','ok',{statusAction:'save'});
    return true;
  }catch(e){
    rememberAppIssue('error','saveState',e);
    storageState.saveFailCount++;
    const msg='저장 실패 · 브라우저 저장공간/권한 확인';
    if(!silent || storageState.saveFailCount===1) notifyStorageAction(msg,'err');
    if(!silent) alertAppError('저장 실패: ', e);
    return false;
  }
}
function loadState(){
  if(!storageState.factoryState) captureFactoryState();
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const saved=raw ? normalizeSavedState(safeJsonParse(raw)) : null;
    storageState.hasSavedState=!!saved;
    if(!saved){
      resetToFactoryState();
      return;
    }
    applyStateObject(saved);
  }catch(e){
    storageState.hasSavedState=false;
    rememberAppIssue('warn','loadState failed', e);
    resetToFactoryState();
  }
}
/* ── 06 · 저장소·선택·편집 ── */
/* 프리셋 저장소·선택·편집 */

function normalizeTraitPresetName(value){
  return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,40);
}
function makeTraitPresetId(){
  const seed=(typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `trait_${String(seed).replace(/[^0-9A-Za-z_-]/g,'')}`;
}
function appendUniqueTraitPreset(presets, seen, preset){
  if(!preset) return;
  if(seen.has(preset.id)) preset.id=makeTraitPresetId();
  seen.add(preset.id);
  presets.push(preset);
}
function emptyTraitPresetStore(){
  return {type:TRAIT_PRESET_FILE_TYPE,webDpsVersion:currentWebDpsVersion(),presetManagement:TRAIT_PRESET_MANAGEMENT_VERSION,presets:[],jewelSettings:null,unitBoard:emptyTraitPresetUnitBoardStore()};
}
function traitPresetStateValues(state){
  return (state && typeof state==='object' && state.values && typeof state.values==='object') ? state.values : {};
}
function dispatchTraitPresetStoreChanged(detail={}){
  try{ window.dispatchEvent(new CustomEvent('dps:traitPresetStoreChanged',{detail})); }catch(error){ rememberAppIssue('warn','프리셋 변경 이벤트', error); }
}
function markPresetStateCurrentVersion(state){
  return normalizeTraitPresetState(state);
}
function cleanTraitPresetForExport(preset,index=0){
  const normalized=normalizeTraitPresetItem(preset,index);
  if(!normalized) return null;
  const state=markPresetStateCurrentVersion(normalized.state);
  if(!state) return null;
  return {
    id:normalized.id,
    name:normalized.name,
    createdAt:normalized.createdAt,
    updatedAt:normalized.updatedAt || Date.now(),
    meta:traitPresetMetaFromSavedState(state),
    state
  };
}
function finalizeTraitPresetStoreForExport(store){
  const source=(store && typeof store==='object') ? store : emptyTraitPresetStore();
  const seen=new Set();
  const presets=[];
  (Array.isArray(source.presets) ? source.presets : []).forEach((item,index)=>{
    const preset=cleanTraitPresetForExport(item,index);
    appendUniqueTraitPreset(presets, seen, preset);
  });
  const unitBoard=normalizeTraitPresetUnitBoardStore(source.unitBoard,presets.map(preset=>preset.id));
  const jewelSettings=normalizeTraitPresetJewelSettings(source.jewelSettings);
  return {
    type:TRAIT_PRESET_FILE_TYPE,
    webDpsVersion:currentWebDpsVersion(),
    presetManagement:TRAIT_PRESET_MANAGEMENT_VERSION,
    presets,
    jewelSettings,
    unitBoard
  };
}
function traitPresetMetaFromValues(values={}){
  const coopMode=normalizeOnOffValue(values.coopMode,'OFF')==='ON';
  const tower=isTowerDifficulty(values.diff);
  const towerFloor=normalizedTowerFloorString(values.challengeTowerFloor || TOWER_FLOOR_INPUT_MIN);
  return {
    diff:isPlanetExplorationDifficulty(values.diff) ? PLANET_EXPLORATION_STORAGE_NAME : String(values.diff || ''),
    penance:String(values.penance || '0'),
    round:String(values.round || '1'),
    challengeTowerFloor:towerFloor,
    mode:tower ? `${towerFloor}층` : (coopMode ? `협동${Math.max(2,Number(normalizeTeamCountValue(values.team,3)))}인` : '개인')
  };
}
function traitPresetMetaFromState(){
  return traitPresetMetaFromValues({diff:vs('diff'),penance:vs('penance'),round:targetRoundStoredValue(),challengeTowerFloor:challengeTowerFloorStoredValue(),coopMode:vs('coopMode'),team:vs('team')});
}
function traitPresetMetaFromSavedState(state){
  return traitPresetMetaFromValues(traitPresetStateValues(state));
}

function normalizeTraitPresetItem(item,index=0){
  if(!item || typeof item!=='object') return null;
  if(!item.state || typeof item.state!=='object') return null;
  const name=normalizeTraitPresetName(item.name || `가져온 프리셋 ${index+1}`);
  if(!name) return null;
  const state=normalizeTraitPresetState(item.state);
  if(!state) return null;
  const now=Date.now();
  return {
    id:String(item.id || makeTraitPresetId()),
    name,
    createdAt:+item.createdAt || +item.savedAt || now,
    updatedAt:+item.updatedAt || +state.savedAt || now,
    meta:{...((item.meta && typeof item.meta==='object') ? item.meta : {}), ...traitPresetMetaFromSavedState(state)},
    state
  };
}
function normalizeTraitPresetStore(data){
  const empty=emptyTraitPresetStore();
  if(!data || typeof data!=='object' || Array.isArray(data) || !Array.isArray(data.presets)) return empty;
  if(data.type && !isTraitPresetFileType(data.type)) return empty;
  const seen=new Set();
  const presets=[];
  const presetIdMap=new Map();
  data.presets.forEach((item,index)=>{
    const sourceId=String(item?.id || '');
    const preset=normalizeTraitPresetItem(item,index);
    if(!preset) return;
    appendUniqueTraitPreset(presets, seen, preset);
    if(sourceId && !presetIdMap.has(sourceId)) presetIdMap.set(sourceId,preset.id);
  });
  const jewelSettings=normalizeTraitPresetJewelSettings(data.jewelSettings);
  const sourceUnitBoard=normalizeTraitPresetUnitBoardStore(data.unitBoard);
  const unitBoard=emptyTraitPresetUnitBoardStore();
  Object.entries(sourceUnitBoard.presets).forEach(([sourceId,state])=>{
    const targetId=presetIdMap.get(sourceId) || (presets.some(preset=>preset.id===sourceId) ? sourceId : '');
    if(targetId) unitBoard.presets[targetId]=normalizeTraitPresetUnitBoardState(state);
  });
  const normalizedUnitBoard=normalizeTraitPresetUnitBoardStore(unitBoard,presets.map(preset=>preset.id));
  // 별도로 저장된 표시 슬롯 수도 유닛 보드의 실제 카드 수와 일치시킨다.
  presets.forEach(preset=>{
    const board=normalizedUnitBoard.presets[preset.id];
    if(board && hasOwn(preset.state.values,'dpsBaseUnitVisibleSlotCount')){
      preset.state.values.dpsBaseUnitVisibleSlotCount=String(board.visibleSlotCount);
    }
  });
  const normalizedStore={...empty,webDpsVersion:currentWebDpsVersion(),presetManagement:TRAIT_PRESET_MANAGEMENT_VERSION,presets,jewelSettings,unitBoard:normalizedUnitBoard};
  return normalizedStore;
}
function loadTraitPresetStore(){
  try{
    const raw=localStorage.getItem(TRAIT_PRESET_STORAGE_KEY);
    return normalizeTraitPresetStore(raw ? safeJsonParse(raw) : null);
  }catch(e){
    rememberAppIssue('warn','loadTraitPresetStore failed', e);
    return emptyTraitPresetStore();
  }
}
function saveTraitPresetStore(store,options={}){
  const compatibility=storedTraitPresetCompatibility();
  const canReplace=options.source==='import' || options.source==='schemaUpdate';
  if(!canReplace && (compatibility.error || compatibility.requiresUpdate)) throw new Error(compatibility.error || '백업 버튼에서 프리셋 최신화를 먼저 완료해 주세요.');
  const result=inspectTraitPresetImportCompatibility(store);
  if(result.requiresUpdate && !(options.source==='import' && options.allowPending===true)) throw new Error(`프리셋 구조 검증 실패: ${result.issues[0]}`);
  const normalized=result.requiresUpdate ? store : normalizeTraitPresetStore(store);
  const verified=inspectTraitPresetImportCompatibility(normalized);
  if(verified.requiresUpdate && !options.allowPending) throw new Error('저장할 프리셋이 현재 형식을 만족하지 않습니다.');
  const previous=localStorage.getItem(TRAIT_PRESET_STORAGE_KEY);
  try{
    localStorage.setItem(TRAIT_PRESET_STORAGE_KEY, JSON.stringify(normalized));
    const saved=inspectTraitPresetImportCompatibility(safeJsonParse(localStorage.getItem(TRAIT_PRESET_STORAGE_KEY)));
    if(saved.requiresUpdate && !options.allowPending) throw new Error('저장 결과 검증에 실패했습니다.');
  }catch(error){
    if(localStorage.getItem(TRAIT_PRESET_STORAGE_KEY)!==previous){
      if(previous===null) localStorage.removeItem(TRAIT_PRESET_STORAGE_KEY);
      else localStorage.setItem(TRAIT_PRESET_STORAGE_KEY,previous);
    }
    throw error;
  }
  if(options.dispatch!==false) dispatchTraitPresetStoreChanged({source:options.source || 'save'});
  return normalized;
}
function loadTraitPresetDrafts(){
  try{
    const data=safeJsonParse(localStorage.getItem(TRAIT_PRESET_DRAFT_STORAGE_KEY));
    return data && typeof data==='object' && !Array.isArray(data) ? data : {};
  }catch(e){ rememberAppIssue('warn','프리셋 임시 변경 로드',e); return {}; }
}
function saveTraitPresetDrafts(drafts){
  const out={};
  Object.entries(drafts || {}).forEach(([id,draft])=>{
    const state=normalizeTraitPresetState(draft?.state);
    if(!id || !state) return;
    out[id]={state};
    if(draft.unitBoard) out[id].unitBoard=normalizeTraitPresetUnitBoardState(draft.unitBoard);
  });
  if(Object.keys(out).length) localStorage.setItem(TRAIT_PRESET_DRAFT_STORAGE_KEY,JSON.stringify(out));
  else localStorage.removeItem(TRAIT_PRESET_DRAFT_STORAGE_KEY);
  return out;
}
function traitPresetDraftForId(id){
  const draft=loadTraitPresetDrafts()[String(id || '')];
  const state=normalizeTraitPresetState(draft?.state);
  return state ? {state,unitBoard:draft.unitBoard ? normalizeTraitPresetUnitBoardState(draft.unitBoard) : null} : null;
}
function clearTraitPresetDraft(id){
  const drafts=loadTraitPresetDrafts();
  delete drafts[String(id || '')];
  saveTraitPresetDrafts(drafts);
}
function clearTraitPresetDrafts(){ localStorage.removeItem(TRAIT_PRESET_DRAFT_STORAGE_KEY); }
function selectedTraitPresetId(){
  return $('traitPresetSelect')?.value || '';
}
function resetTraitPresetNameInput(){
  const input=$('traitPresetName');
  if(!input) return;
  input.value='';
  input.placeholder=TRAIT_PRESET_NAME_PLACEHOLDER;
}
function resolveTraitPresetSelection(store,requestedId=''){
  const presets=Array.isArray(store?.presets) ? store.presets : [];
  if(!presets.length) return '';
  const requested=String(requestedId || '');
  if(requested && presets.some(preset=>preset.id===requested)) return requested;
  return firstTraitPresetSelectId(store);
}
function rememberTraitPresetSelection(id){
  const selectedTraitPresetIdValue=String(id || '').trim();
  updateTraitPresetStatus({selectedTraitPresetId:selectedTraitPresetIdValue},{persist:true});
}
function finishTraitPresetSelection(id, options={}){
  const selectedId=String(id || '').trim();
  rememberTraitPresetSelection(selectedId);
  if(options.refresh!==false) refreshTraitPresetControls(selectedId);
}

const TRAIT_PRESET_SELECT_GROUPS=[
  {key:'solo', label:'개인전'},
  {key:'coop', label:'협동전'},
  {key:'tower', label:'도전의 탑'},
  {key:'planet', label:'행성탐사'}
];
const TRAIT_PRESET_DIFFICULTY_ORDER=[...DPS_CONFIG.dpsTable.difficulties, TOWER_DIFFICULTY_NAME];
function traitPresetValueSource(preset){
  const values=(preset && preset.state && preset.state.values && typeof preset.state.values==='object') ? preset.state.values : {};
  const meta=(preset && preset.meta && typeof preset.meta==='object') ? preset.meta : {};
  return {values,meta};
}
function traitPresetNumberValue(value, fallback=0){
  const normalized=String(value ?? '').replace(/[^0-9.+-]/g,'');
  const number=Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}
function traitPresetSortInfo(preset){
  const {values,meta}=traitPresetValueSource(preset);
  const diff=values.diff || meta.diff || '';
  const diffIndex=TRAIT_PRESET_DIFFICULTY_ORDER.indexOf(difficultyName(diff));
  const towerFloor=traitPresetNumberValue(values.challengeTowerFloor || meta.challengeTowerFloor, TOWER_FLOOR_INPUT_MIN);
  const planetFloor=traitPresetNumberValue(values.planetExplorationFloor || meta.planetExplorationFloor, PLANET_EXPLORATION_FLOOR_INPUT_MIN);
  return {
    diffOrder:diffIndex>=0 ? diffIndex : TRAIT_PRESET_DIFFICULTY_ORDER.length,
    penance:traitPresetNumberValue(values.penance || meta.penance, 0),
    round:traitPresetNumberValue(values.round || meta.round, 1),
    towerFloor,
    planetFloor,
    name:normalizeTraitPresetName(preset?.name || ''),
    createdAt:+preset?.createdAt || 0,
    updatedAt:+preset?.updatedAt || 0
  };
}
function comparePresetForSelect(a,b,categoryKey){
  const left=traitPresetSortInfo(a);
  const right=traitPresetSortInfo(b);
  const numberKeys=categoryKey==='tower'
    ? ['towerFloor','diffOrder','penance','round','createdAt','updatedAt']
    : (categoryKey==='planet'
      ? ['planetFloor','diffOrder','penance','round','createdAt','updatedAt']
      : ['diffOrder','penance','round','towerFloor','planetFloor','createdAt','updatedAt']);
  for(const key of numberKeys){
    if(left[key]!==right[key]) return left[key]-right[key];
  }
  return left.name.localeCompare(right.name,'ko');
}
function traitPresetCategoryKey(preset){
  const {values,meta}=traitPresetValueSource(preset);
  if(isTowerDifficulty(values.diff || meta.diff)) return 'tower';
  if(isPlanetExplorationDifficulty(values.diff || meta.diff)) return 'planet';
  if(normalizeOnOffValue(values.coopMode,'OFF')==='ON') return 'coop';
  return 'solo';
}
function sortedTraitPresetBuckets(store){
  const buckets=TRAIT_PRESET_SELECT_GROUPS.reduce((out,group)=>{ out[group.key]=[]; return out; },{});
  (Array.isArray(store?.presets) ? store.presets : []).forEach(preset=>{
    const key=traitPresetCategoryKey(preset);
    (buckets[key] || buckets.solo).push(preset);
  });
  TRAIT_PRESET_SELECT_GROUPS.forEach(group=>{
    buckets[group.key].sort((a,b)=>comparePresetForSelect(a,b,group.key));
  });
  return buckets;
}
function firstTraitPresetSelectId(store){
  const buckets=sortedTraitPresetBuckets(store);
  for(const group of TRAIT_PRESET_SELECT_GROUPS){
    const preset=buckets[group.key]?.[0];
    if(preset?.id) return preset.id;
  }
  return '';
}
function traitPresetOptionName(preset, categoryKey){
  const {values,meta}=traitPresetValueSource(preset);
  let name=normalizeTraitPresetName(preset?.name || '');
  name=name.replace(/^(개인전|개인|솔로|협동전|협동|버스)\s*[-–—:·]\s*/,'').trim();
  if(categoryKey==='tower'){
    name=name.replace(/^도전의\s*탑\s*[-–—:·]?\s*/,'').trim();
    if(/^\d+$/.test(name)) name=`${name}층`;
    if(!name){
      const floor=normalizedTowerFloorString(values.challengeTowerFloor || meta.challengeTowerFloor || '');
      name=floor ? `${floor}층` : '';
    }
  }
  if(categoryKey==='planet'){
    name=name.replace(/^(행성\s*탐사|행성탐사)(?:[-–—:·]?\s*(코랄|아이어|제루스))?\s*[-–—:·]?\s*/,'').trim();
    if(/^\d+$/.test(name)) name=`${name}층`;
    if(!name){
      const floor=normalizedPlanetExplorationFloorString(values.planetExplorationFloor || meta.planetExplorationFloor || '');
      name=floor ? `${floor}층` : '';
    }
  }
  return name || normalizeTraitPresetName(preset?.name || '프리셋');
}
function traitPresetSelectLabel(preset, updatedIds, categoryKey){
  const suffix=updatedIds.has(preset.id) ? ' · 업데이트됨' : '';
  return `${traitPresetOptionName(preset, categoryKey)}${suffix}`;
}
function traitPresetOptionLabel(option){
  return option?.dataset?.traitPresetLabel || option?.textContent || option?.label || '';
}
function setTraitPresetCustomSelectOpen(custom, open){
  if(!custom) return;
  const active=!!open;
  custom.classList.toggle('is-open',active);
  custom.closest('.trait-preset-form-card')?.classList.toggle('is-menu-open',active);
  custom.closest('.trait-preset-panel')?.classList.toggle('is-menu-open',active);
  if(active){
    const rect=custom.getBoundingClientRect();
    const pane=DPS_ROOT.getBoundingClientRect();
    const availableBelow=Math.min(window.innerHeight,window.DPS_STANDALONE_VIEW ? window.innerHeight : pane.bottom)-rect.bottom;
    const availableAbove=rect.top-(window.DPS_STANDALONE_VIEW ? 0 : pane.top);
    const opensUp=availableBelow<205 && availableAbove>availableBelow;
    custom.classList.toggle('opens-up',opensUp);
    custom.style.setProperty('--trait-preset-menu-height',`${Math.max(0,Math.floor((opensUp?availableAbove:availableBelow)-8))}px`);
  }else custom.classList.remove('opens-up');
  custom.querySelector('[data-trait-preset-custom-button]')?.setAttribute('aria-expanded',active ? 'true' : 'false');
  const menu=custom.querySelector('[data-trait-preset-custom-menu]');
  if(menu) menu.hidden=!active;
}
function closeTraitPresetCustomSelect(custom){
  setTraitPresetCustomSelectOpen(custom,false);
}
function closeTraitPresetCustomSelects(except=null){
  qsa('[data-trait-preset-custom-select]').forEach(custom=>{ if(custom!==except) closeTraitPresetCustomSelect(custom); });
}
function appendTraitPresetCustomOption(menu, select, option){
  if(option.hidden) return;
  const item=document.createElement('button');
  const selected=option.value===select.value;
  item.type='button';
  item.className='trait-preset-custom-option';
  item.dataset.traitPresetCustomOption='1';
  item.dataset.value=option.value;
  item.setAttribute('role','option');
  item.setAttribute('aria-selected',selected?'true':'false');
  item.disabled=option.disabled;
  item.classList.toggle('is-selected',selected);
  const text=document.createElement('span');
  text.className='trait-preset-custom-option-text';
  text.textContent=traitPresetOptionLabel(option);
  item.append(text);
  // 선택과 삭제는 별도 버튼입니다. 삭제를 눌러도 해당 프리셋이 로드되지 않습니다.
  if(!option.disabled && option.value){
    const row=document.createElement('div');
    row.className='trait-preset-custom-row';
    row.appendChild(item);
    const remove=document.createElement('button');
    remove.type='button';
    remove.className='trait-preset-custom-delete';
    remove.dataset.traitPresetCustomDelete=option.value;
    remove.setAttribute('aria-label',`${traitPresetOptionLabel(option)} 프리셋 삭제 (두 번 누르면 삭제)`);
    remove.innerHTML='<span class="trait-preset-delete-confirm-text" aria-hidden="true">삭제 확인</span><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/></svg>';
    row.appendChild(remove);
    menu.appendChild(row);
  }else menu.appendChild(item);
}
function renderTraitPresetCustomMenu(custom, select){
  const menu=custom.querySelector('[data-trait-preset-custom-menu]');
  if(!menu) return;
  menu.innerHTML='';
  [...select.children].forEach(child=>{
    if(child.tagName==='OPTGROUP'){
      const group=document.createElement('div');
      group.className='trait-preset-custom-group';
      const label=document.createElement('div');
      label.className='trait-preset-custom-group-label';
      label.textContent=child.label || '';
      group.appendChild(label);
      [...child.children].forEach(option=>appendTraitPresetCustomOption(group,select,option));
      if(group.querySelector('.trait-preset-custom-option')) menu.appendChild(group);
      return;
    }
    if(child.tagName==='OPTION') appendTraitPresetCustomOption(menu,select,child);
  });
  menu.hidden=!custom.classList.contains('is-open');
}
function syncTraitPresetCustomSelect(select){
  if(!select?.matches?.('#traitPresetSelect')) return;
  const next=select.nextElementSibling;
  let custom=next?.matches?.(`[data-trait-preset-custom-select="${select.id}"]`) ? next : null;
  if(!custom){
    custom=document.createElement('div');
    custom.className='trait-preset-custom-select';
    custom.dataset.traitPresetCustomSelect=select.id;
    custom.innerHTML='<button class="trait-preset-custom-button" type="button" data-trait-preset-custom-button aria-haspopup="listbox" aria-expanded="false"><span class="trait-preset-custom-button-text"></span><span class="trait-preset-custom-arrow" aria-hidden="true"></span></button><div class="trait-preset-custom-menu" data-trait-preset-custom-menu role="listbox" hidden></div>';
    select.insertAdjacentElement('afterend',custom);
  }
  select.classList.add('trait-preset-native-select');
  select.dataset.traitPresetNativeSelect='1';
  select.tabIndex=-1;
  select.setAttribute('aria-hidden','true');
  const button=custom.querySelector('[data-trait-preset-custom-button]');
  const buttonText=custom.querySelector('.trait-preset-custom-button-text');
  const selected=select.selectedOptions?.[0] || [...select.options].find(option=>option.value===select.value) || null;
  if(buttonText) buttonText.textContent=traitPresetOptionLabel(selected) || (select.disabled ? '저장된 프리셋 없음' : '프리셋 목록');
  if(button) button.disabled=select.disabled;
  custom.classList.toggle('is-disabled',select.disabled);
  renderTraitPresetCustomMenu(custom,select);
}
function openTraitPresetCustomSelect(custom){
  const select=$(custom?.dataset?.traitPresetCustomSelect || '');
  if(!select || select.disabled) return;
  closeTraitPresetCustomSelects(custom);
  setTraitPresetCustomSelectOpen(custom,true);
  renderTraitPresetCustomMenu(custom,select);
}
function renderTraitPresetSelectOptions(select, store, selected, updatedIds){
  const hasPresets=Array.isArray(store?.presets) && store.presets.length>0;
  select.innerHTML='';
  const empty=document.createElement('option');
  empty.value='';
  empty.textContent=hasPresets ? '프리셋 목록' : '저장된 프리셋 없음';
  empty.disabled=true;
  empty.hidden=hasPresets;
  select.appendChild(empty);
  const buckets=sortedTraitPresetBuckets(store);
  TRAIT_PRESET_SELECT_GROUPS.forEach(group=>{
    const presets=buckets[group.key] || [];
    if(!presets.length) return;
    const optgroup=document.createElement('optgroup');
    optgroup.label=group.label;
    presets.forEach(preset=>{
      const option=document.createElement('option');
      option.value=preset.id;
      const label=traitPresetSelectLabel(preset, updatedIds, group.key);
      option.className='trait-preset-name-option';
      option.dataset.traitPresetNameOption='1';
      option.dataset.traitPresetLabel=label;
      option.textContent=label;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
  select.value=selected || '';
  select.disabled=!hasPresets;
  syncTraitPresetCustomSelect(select);
}
function refreshTraitPresetControls(selectedId){
  const store=loadTraitPresetStore();
  const status=loadTraitPresetStatusData();
  const updatedIds=new Set(status.updatedPresetIds);
  const select=$('traitPresetSelect');
  const nameInput=$('traitPresetName');
  const selected=resolveTraitPresetSelection(store,selectedId || selectedTraitPresetId() || status.selectedTraitPresetId);
  if(select) renderTraitPresetSelectOptions(select, store, selected, updatedIds);
  const currentId=select?.value || '';
  const current=store.presets.find(preset=>preset.id===currentId);
  const compatibility=storedTraitPresetCompatibility();
  dispatchTraitPresetStoreChanged({source:'selection', selectedTraitPresetId:current?.id || ''});
  qsa('[data-action="loadTraitPreset"],[data-action="updateTraitPreset"],[data-action="deleteTraitPreset"]').forEach(btn=>{
    btn.disabled=!current || !!compatibility.error || compatibility.requiresUpdate;
  });
  // 새 프리셋은 가져오기 없이도 저장할 수 있고, 전체 초기화는 저장된 프리셋이 있을 때만 허용합니다.
  qsa('[data-action="saveTraitPreset"]').forEach(btn=>{ btn.disabled=!!compatibility.error || compatibility.requiresUpdate; });
  qsa('[data-action="resetAllTraitPresetState"]').forEach(btn=>{ btn.disabled=!store.presets.length; });
  qsa('[data-action="backupTraitPresets"]').forEach(btn=>{ btn.disabled=!store.presets.length || !!compatibility.error; });
  // 최초 사용 상태에서 기존 프리셋 가져오기 / 직접 신규 저장 중 하나를 안내한다.
  const noPresets=store.presets.length===0;
  qsa('[data-action="importTraitPresets"],[data-action="saveTraitPreset"]').forEach(btn=>{
    btn.classList.toggle('is-first-use',noPresets);
  });
  renderTraitPresetStatus(status, store);
  if(nameInput) nameInput.placeholder=TRAIT_PRESET_NAME_PLACEHOLDER;
}

function saveTraitPreset(){
  const input=$('traitPresetName');
  const name=normalizeTraitPresetName(input?.value || '');
  if(!name){
    notifyStorageAction('프리셋 이름을 입력하세요.','err');
    if(input) input.focus();
    return false;
  }
  let snapshot=null;
  try{
    let store=loadTraitPresetStore();
    if(store.presets.some(preset=>preset.name===name) && !window.confirm(`'${name}' 프리셋을 현재 설정으로 덮어쓸까요?`)) return false;
    snapshot=captureTraitPresetMutationSnapshot();
    storageState.presetMutationInProgress=true;
    const beforeStore=JSON.parse(JSON.stringify(store));
    const now=Date.now();
    const state=makeTraitPresetStateObject();
    if(!state) throw new Error('현재 화면값을 프리셋 상태로 저장할 수 없습니다.');
    const index=store.presets.findIndex(preset=>preset.name===name);
    const previousJewelSettings=normalizeTraitPresetJewelSettings(store.jewelSettings);
    const currentJewelSettings=captureTraitPresetJewelSettings();
    const jewelChanged=!previousJewelSettings || stableTraitPresetValue(previousJewelSettings)!==stableTraitPresetValue(currentJewelSettings);
    let id;
    if(index>=0){
      const prev=store.presets[index];
      id=prev.id;
      store.presets[index]={...prev,name,updatedAt:now,meta:traitPresetMetaFromState(),state};
    }else{
      id=makeTraitPresetId();
      store.presets.push({id,name,createdAt:now,updatedAt:now,meta:traitPresetMetaFromState(),state});
    }
    // 프리셋 신규 저장/덮어쓰기에도 공통 설정은 현재 화면값을 기준으로 한 번만 반영한다.
    const sharedKeys=traitPresetSharedStateKeys(state);
    const commonUpdatedIds=[];
    store.presets=store.presets.map(item=>{
      if(item.id===id) return item;
      const synced=buildSyncedTraitPresetState(state,item.state,sharedKeys);
      if(!synced || stableTraitPresetValue(synced)===stableTraitPresetValue(item.state)) return item;
      commonUpdatedIds.push(item.id);
      return {...item,updatedAt:now,meta:traitPresetMetaFromSavedState(synced),state:synced};
    });
    setTraitPresetUnitBoardState(store,id,captureTraitPresetUnitBoardState());
    store.jewelSettings=currentJewelSettings;
    store=saveTraitPresetStore(store,{source:'saveTraitPreset'});
    clearTraitPresetDraft(id);
    const commonPresetIds=(jewelChanged || commonUpdatedIds.length) ? store.presets.map(item=>item.id) : [];
    markTraitPresetUpdated(commonPresetIds.length ? commonPresetIds : [id],'update',{
      commonChangeKeys:[...(jewelChanged ? ['jewelSettings'] : []),...(commonUpdatedIds.length ? ['state:shared'] : [])],
      commonPresetIds,
      singleChangeKeys:['storedPreset'],
      singlePresetIds:[id],beforeStore,afterStore:store
    });
    updateTraitPresetStatus({pendingJewelSettings:false},{persist:true});

    finishTraitPresetSelection(id);
    resetTraitPresetNameInput();
    
    notifyStorageAction(index>=0 ? `프리셋 덮어쓰기 완료: ${name}` : `프리셋 저장 완료: ${name}`,'ok',{statusAction:'save'});
    return true;
  }catch(e){
    restoreTraitPresetMutationSnapshot(snapshot,'[trait preset save rollback failed]');
    rememberAppIssue('error','[trait preset save failed]',e);
    notifyStorageAction(e?.message || '프리셋 저장 실패','err');
    return false;
  }finally{storageState.presetMutationInProgress=false;}
}
function applyTraitPresetState(preset,options={}){
  const compatibility=storedTraitPresetCompatibility();
  requireCompatibleTraitPreset(compatibility);
  const state=buildTraitPresetApplyState(preset, options);
  if(!state) throw new Error('프리셋 데이터가 올바르지 않습니다.');
  state.ui={fontScale:getFontScale()};
  applyStateObject(state,{recalculate:false});
  applyTraitPresetJewelSettings(options.jewelSettings);
  applyTraitPresetUnitBoardState(options.unitBoardIncluded ? options.unitBoardState : null,{recalculate:false});
  if(recalc({save:false})===false) throw new Error('계산 오류로 프리셋을 적용할 수 없습니다.');
  if(options.persist!==false){
    const saved=saveState({silent:true});
    if(saved===false) throw new Error('프리셋은 적용했지만 브라우저 저장에 실패했습니다.');
  }
}
function loadTraitPresetById(id,options={}){
  const compatibility=storedTraitPresetCompatibility();
  if(compatibility.error || compatibility.requiresUpdate){
    rememberTraitPresetSelection(id);
    refreshTraitPresetControls(id);
    if(options.notifyMissing!==false) notifyStorageAction(compatibility.error || '백업 버튼에서 프리셋 최신화를 먼저 완료해 주세요.','warn');
    return false;
  }
  const store=loadTraitPresetStore();
  const preset=store.presets.find(item=>item.id===id);
  if(!preset){
    if(options.notifyMissing!==false) notifyStorageAction('불러올 프리셋을 선택하세요.','err');
    return false;
  }
  let snapshot=null;
  try{
    if(!storageState.presetMutationInProgress){
      snapshot=captureTraitPresetMutationSnapshot();
      snapshot.selectedId=loadTraitPresetStatusData().selectedTraitPresetId || snapshot.selectedId;
    }
    const draft=options.useDraft===false ? null : (options.discardDraft===true ? null : traitPresetDraftForId(id));
    const applyPreset=draft?.state ? {...preset,state:draft.state} : preset;
    applyTraitPresetState(applyPreset,{
      persist:true,
      preserveSharedValues:options.preserveSharedValues===true,
      jewelSettings:store.jewelSettings,
      unitBoardIncluded:draft?.unitBoard ? true : traitPresetHasUnitBoard(store,id),
      unitBoardState:draft?.unitBoard || traitPresetUnitBoardState(store,id)
    });
    if(options.discardDraft===true) clearTraitPresetDraft(id);
    updateTraitPresetStatus({pendingJewelSettings:traitPresetJewelSettingsChanged(store)},{persist:true});

    finishTraitPresetSelection(id);
    if(options.notifySuccess!==false){notifyStorageAction(`프리셋 적용 완료: ${preset.name}`,'ok',{statusAction:'load'});}
    
    return true;
  }catch(e){
    restoreTraitPresetMutationSnapshot(snapshot,'[trait preset load rollback failed]');
    rememberAppIssue('error','[trait preset load failed]',e);
    notifyStorageAction(e?.message || '프리셋 적용 실패','err');
    return false;
  }
}
function loadTraitPreset(){
  const id=selectedTraitPresetId();
  if(id && loadTraitPresetStatusData().selectedTraitPresetId===id && traitPresetUpdateStatus().hasChanges){
    return requestConfirmAction(`restoreTraitPreset:${id}`,'현재 수치 변경을 버리고 저장된 프리셋으로 복원하려면 한 번 더 누르세요.',()=>loadTraitPresetById(id,{preserveSharedValues:false,useDraft:false,discardDraft:true}));
  }
  return loadTraitPresetById(id,{preserveSharedValues:false,useDraft:false,discardDraft:true});
}
function stableTraitPresetValue(value){
  if(value && typeof value==='object'){
    const normalize=input=>{
      if(Array.isArray(input)) return input.map(normalize);
      if(input && typeof input==='object'){
        return Object.keys(input).sort().reduce((out,key)=>{ out[key]=normalize(input[key]); return out; },{});
      }
      return input ?? '';
    };
    return JSON.stringify(normalize(value));
  }
  return String(value ?? '');
}
function buildSyncedTraitPresetState(baseState, targetState, changedSharedKeys){
  const base=normalizeTraitPresetState(baseState);
  const target=normalizeTraitPresetState(targetState);
  if(!base || !target) return null;
  // 실제로 바뀐 공통 필드만 전파한다. 원본 프리셋의 나머지 능력치·특성 투자는 보존.
  const values={...target.values};
  for(const key of changedSharedKeys || []){
    if(!key.startsWith('value:')) continue;
    const id=key.slice('value:'.length);
    if(TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(id)) continue;
    if(hasOwn(base.values,id)) values[id]=base.values[id];
    else delete values[id];
  }
  const zeroScore=changedSharedKeys?.has('zeroScore') ? base.zeroScore : target.zeroScore;
  return makeTraitPresetStateEnvelope({zeroScore},values,{...target.inv,...(changedSharedKeys?.has('inv:116') ? {116:base.inv[116]} : {})});
}
// 프리셋별 값과 공통 값을 구별하는 단일 기준 (업데이트·저장·가져오기에서 공유).
function traitPresetSharedStateKeys(state){
  const keys=new Set(['inv:116','zeroScore']);
  Object.keys(state?.values || {}).forEach(id=>{
    if(id!=='dpsBaseUnitVisibleSlotCount' && !TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(id)) keys.add(`value:${id}`);
  });
  return keys;
}
function traitPresetSharedStateSignature(state){
  const values=Object.fromEntries(Object.entries(state?.values || {}).filter(([id])=>
    id!=='dpsBaseUnitVisibleSlotCount' && !TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(id)));
  return stableTraitPresetValue({values,donation:state?.inv?.[116] ?? 0,zeroScore:normalizeZeroScoreState(state?.zeroScore || {rows:[]})});
}
function traitPresetImportChangeIsShared(key){
  if(key==='donationMigration' || key==='zeroScore' || key==='inv:116') return true;
  return key?.startsWith('value:') && !TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(key.slice(6));
}
function traitPresetImportReadableName(id){
  if(hasOwn(REMOVED_PRESET_VALUE_LABELS,id)) return REMOVED_PRESET_VALUE_LABELS[id];
  if(id==='donationBuffType' || id==='116' || id==='inv:116') return '나눔 설정';
  if(id==='zeroScore') return '더제로 전당 계산값';
  if(id==='inv') return '특성 투자';
  if(id==='unitBoard') return '유닛 보드';
  const name=traitPresetChangeKeyLabel(id?.startsWith('inv:') || id?.startsWith('value:') ? id : `value:${id}`);
  if(name && name!==id && name!==`value:${id}`) return name;
  const field=DPS_BODY.querySelector(`label[for="${CSS.escape(String(id))}"]`);
  return field?.textContent?.trim() || '저장 항목';
}
function traitPresetImportErrorLocation(path){
  const text=String(path || '');
  const suffix=text.match(/^(프리셋 .*?번째\))\.(.*)$/);
  if(suffix){
    const detail=suffix[2];
    if(detail.startsWith('inv.')) return `${suffix[1]} · ${traitPresetImportReadableName(`inv:${detail.split('.')[1]}`)}`;
    if(detail.startsWith('zeroScore')) return `${suffix[1]} · 더제로 전당 계산값`;
    if(detail.startsWith('donationBuffType')) return `${suffix[1]} · 나눔 설정`;
    return `${suffix[1]} · ${traitPresetImportReadableName(detail.split(/[.[]/)[0])}`;
  }
  if(text.includes('유닛 보드')) return '유닛 보드 저장 정보';
  return text;
}
function traitPresetImportPresetPath(item,index){
  const name=typeof item?.name==='string' && item.name.trim() ? item.name.trim() : '저장된 이름 없음';
  return `프리셋 "${name}" (${index+1}번째)`;
}
function traitPresetDonationDisplay(type){
  return ({none:'미적용',sp:'일반 나눔',paid:'특별 나눔'})[type] || '나눔 설정';
}
const TRAIT_PRESET_CHANGE_LABEL_OVERRIDES=Object.freeze({
  gameMode:'게임 모드',
  [PRESET_BATTLE_MODE_VALUE_ID]:'전투 모드',
  rp:'RP',sp:'SP',xp:'XP',bxp:'BXP',soul:'혼',
  diff:'난이도',
  round:'목표 라운드',
  penance:'고행 단계',
  spBankApply:'SP 은행 반영',
  jewelErosionRes:'어비스 심연 내성',
  skillRound:'버스 성소 · 계산 라운드',
  skillMode:'버스 성소 · 계산 모드'
});
const TRAIT_PRESET_INVESTMENT_SWITCH_IDS=new Set(['traitLimitLifeBonus','traitLimitMagicAP','traitLimitMultiTarget','traitLimitInfinite']);
function traitPresetChangeValueText(key,value,state=null){
  if(value===undefined) return '저장값 없음';
  if(key==='inv:116') return traitPresetDonationDisplay(state?.values?.donationBuffType ?? donationTypeFromInvestment(value));
  if(key==='value:donationBuffType') return traitPresetDonationDisplay(value);
  if(key==='value:gameMode') return state?.values?.coopMode==='ON' ? '협동전' : '개인전';
  if(key==='value:additionalRuneSlots'){
    const slots=parseAdditionalRuneSlots(value).slice(1);
    const changed=slots.filter(rune=>rune.registered);
    return changed.length ? `룬 ${changed.length}칸 설정 (${slots.map((rune,i)=>rune.registered?i+2:null).filter(Boolean).join(', ')}번)` : '추가 룬 없음';
  }
  if(key.startsWith('value:') && TRAIT_PRESET_INVESTMENT_SWITCH_IDS.has(key.slice(6)))
    return String(value).toUpperCase()==='ON' ? '투자 가능' : '투자 제한';
  if(key===`value:${PRESET_BATTLE_MODE_VALUE_ID}`) return normalizePresetBattleMode(value)==='artifact' ? '유물' : '일반';
  if(value===true) return '사용';
  if(value===false) return '미사용';
  if(value===null) return '없음';
  if(typeof value==='object') return '구성 데이터';
  return String(value);
}
function traitPresetChangeDetail(key,before,after,scope,presetId='',label=''){
  return {key,scope,presetId,before:String(before),after:String(after),...(label ? {label} : {})};
}
function mergeTraitPresetChangeDetails(previous=[],incoming=[]){
  const rows=new Map();
  [...previous,...incoming].forEach(row=>{
    const id=`${row.scope}:${row.presetId}:${row.key}`;
    const old=rows.get(id);
    rows.set(id,old ? {...old,after:row.after} : {...row});
  });
  return [...rows.values()].filter(row=>row.before!==row.after).slice(0,800);
}
// 유닛 구성과 성소 정보는 서로 독립적으로 변경을 감지한다.
// 성소 슬롯의 길이는 실제 저장값을 보존하며, 신규·구형 미설정 프리셋은 0슬롯이다.
function traitPresetUnitBoardChangeKeys(beforeBoard,afterBoard){
  const previous=normalizeTraitPresetUnitBoardState(beforeBoard);
  const current=normalizeTraitPresetUnitBoardState(afterBoard);
  const withoutSanctuary=({sanctuaryInfo,...unitBoard})=>unitBoard;
  const keys=[];
  if(stableTraitPresetValue(withoutSanctuary(previous))!==stableTraitPresetValue(withoutSanctuary(current))) keys.push('unitBoard');
  const before=previous.sanctuaryInfo.slots,after=current.sanctuaryInfo.slots;
  if(beforeBoard && !hasOwn(beforeBoard,'sanctuaryInfo') && hasOwn(afterBoard || {},'sanctuaryInfo')) keys.push('sanctuaryInfo:init');
  if(before.length!==after.length) keys.push('sanctuaryInfo:slotCount');
  const blank=DPS_SANCTUARY_BLANK_SLOT();
  for(let index=0;index<Math.max(before.length,after.length);index++){
    const oldSlot=before[index] || blank,newSlot=after[index] || blank;
    if(oldSlot.start!==newSlot.start || oldSlot.end!==newSlot.end) keys.push(`sanctuaryInfo:${index}:range`);
    for(const field of ['skill1','count1','skill2','count2']){
      if(oldSlot[field]!==newSlot[field]) keys.push(`sanctuaryInfo:${index}:${field}`);
    }
  }
  return keys;
}
// 백업 모달의 세부 비교는 정규화된 프리셋 데이터만 읽으며 저장 상태를 수정하지 않는다.
function traitPresetUnitBoardDetailedChanges(beforeBoard,afterBoard,presetId){
  const oldBoard=normalizeTraitPresetUnitBoardState(beforeBoard);
  const newBoard=normalizeTraitPresetUnitBoardState(afterBoard);
  const rows=[];
  const add=(key,before,after,label)=>{
    if(stableTraitPresetValue(before)===stableTraitPresetValue(after))return;
    rows.push(traitPresetChangeDetail(key,before??'없음',after??'없음','single',presetId,label));
  };
  const unitName=id=>dpsBaseUnitById(id)?.label || String(id || '없음');
  const beforeUnits=new Map(oldBoard.units.map(unit=>[unit.slot,unit]));
  const afterUnits=new Map(newBoard.units.map(unit=>[unit.slot,unit]));
  const fields={quantity:'수량',enhanceExpected:'강화 기대값',limitBreak:'한계 돌파',voidPower:'공허의 힘',legendaryMythicJewel:'전설/신화 쥬얼'};
  [...new Set([...beforeUnits.keys(),...afterUnits.keys()])].sort((a,b)=>a-b).forEach(slot=>{
    const previous=beforeUnits.get(slot),current=afterUnits.get(slot);
    const prefix=`유닛 보드 · ${slot+1}번 슬롯`;
    add(`unitBoard:slot:${slot}:unitId`,previous ? unitName(previous.unitId) : '없음',current ? unitName(current.unitId) : '없음',`${prefix} · 유닛`);
    Object.entries(fields).forEach(([field,name])=>{
      const before=previous?.[field],after=current?.[field];
      if(before===undefined && after===undefined)return;
      // 슬롯이 교체되는 경우에도 옵션 변경을 누락하지 않고 기록한다.
      add(`unitBoard:slot:${slot}:${field}`,before===undefined?'없음':before,after===undefined?'없음':after,`${prefix} · ${name}`);
    });
  });
  add('unitBoard:visibleSlotCount',oldBoard.visibleSlotCount,newBoard.visibleSlotCount,'유닛 보드 · 표시 슬롯 수');
  const oldExpanded=new Set(oldBoard.slotExpansions),newExpanded=new Set(newBoard.slotExpansions);
  [...new Set([...oldExpanded,...newExpanded])].sort().forEach(id=>
    add(`unitBoard:expansion:${id}`,oldExpanded.has(id)?'사용':'미사용',newExpanded.has(id)?'사용':'미사용',`유닛 보드 · ${unitName(id)} · 슬롯 확장`));
  const beforeExtras=oldBoard.additionalUnitSettings,afterExtras=newBoard.additionalUnitSettings;
  const walk=(before,after,path,key,label)=>{
    if(stableTraitPresetValue(before)===stableTraitPresetValue(after))return;
    if((before && typeof before==='object') || (after && typeof after==='object')){
      const a=before && typeof before==='object' ? before : {};
      const b=after && typeof after==='object' ? after : {};
      const names=[...new Set([...Object.keys(a),...Object.keys(b)])].sort((x,y)=>Number(x)-Number(y) || x.localeCompare(y));
      names.forEach(name=>walk(a[name],b[name],[...path,name],`${key}:${name}`,`${label} · ${/^\d+$/.test(name)?`${Number(name)+1}번`:name}`));
    }else add(key,before,after,label);
  };
  [...new Set([...Object.keys(beforeExtras),...Object.keys(afterExtras)])].sort().forEach(id=>
    walk(beforeExtras[id],afterExtras[id],[],`unitBoard:extra:${id}`,`유닛 보드 · ${unitName(id)} · 추가 설정`));
  return rows;
}
function traitPresetJewelDetailedChanges(beforeSettings,afterSettings){
  const old=normalizeTraitPresetJewelSettings(beforeSettings)?.legendaryMythicJewels || {};
  const next=normalizeTraitPresetJewelSettings(afterSettings)?.legendaryMythicJewels || {};
  const rows=[];
  const labels={ad:'공격력',as:'공격 속도',td:'추가 피해',ua:'유닛 공격력',enhance:'강화',mythic:'신화 여부'};
  [...new Set([...Object.keys(old),...Object.keys(next)])].sort().forEach(name=>{
    const a=old[name] || {},b=next[name] || {};
    [...new Set([...Object.keys(a),...Object.keys(b)])].sort().forEach(field=>{
      const before=a[field]??'없음',after=b[field]??'없음';
      if(stableTraitPresetValue(before)!==stableTraitPresetValue(after))
        rows.push(traitPresetChangeDetail(`jewelSettings:${name}:${field}`,before,after,'common','',`쥬얼 설정 · ${name} · ${labels[field] || field}`));
    });
  });
  return rows;
}
function traitPresetZeroScoreDetailedChanges(beforeValue,afterValue,presetId){
  const before=normalizeZeroScoreState(beforeValue || {rows:[]}).rows || [];
  const after=normalizeZeroScoreState(afterValue || {rows:[]}).rows || [];
  const rows=[];
  if(before.length!==after.length)rows.push(traitPresetChangeDetail('zeroScore:rowCount',before.length,after.length,'common',presetId,'승단 계산 · 항목 수'));
  const names={type:'항목',current:'현재 수치',target:'목표 수치',star:'별 표시',currentHonor:'현재 명예',targetHonor:'목표 명예',honorCurrent:'명예 현재값',honorTarget:'명예 목표값'};
  for(let index=0;index<Math.max(before.length,after.length);index++){
    const a=before[index] || {},b=after[index] || {};
    [...new Set([...Object.keys(a),...Object.keys(b)])].forEach(field=>{
      const old=a[field]??'없음',next=b[field]??'없음';
      if(stableTraitPresetValue(old)!==stableTraitPresetValue(next))
        rows.push(traitPresetChangeDetail(`zeroScore:${index}:${field}`,old,next,'common',presetId,`승단 계산 · ${index+1}번 · ${names[field] || field}`));
    });
  }
  return rows;
}
function traitPresetSanctuaryValueText(field,value){
  if(field==='skill1' || field==='skill2') return value || '선택 안함';
  return String(value ?? 0);
}
// 변경되는 순간의 값만 보관한다. 이전 버전에서 기록되지 않은 과거 값은 추정하지 않는다.
function traitPresetChangeDetailsForStores(beforeStore,afterStore){
  const beforePresets=new Map((beforeStore?.presets || []).map(row=>[row.id,row]));
  const afterPresets=afterStore?.presets || [];
  const details=[];
  const add=(key,oldValue,newValue,scope,id='',oldState=null,newState=null)=>{
    if(stableTraitPresetValue(oldValue)===stableTraitPresetValue(newValue)) return;
    const before=traitPresetChangeValueText(key,oldValue,oldState);
    const after=traitPresetChangeValueText(key,newValue,newState);
    if(before===after && typeof oldValue!=='object' && typeof newValue!=='object') return;
    details.push(traitPresetChangeDetail(key,typeof oldValue==='object' ? '이전 구성' : before,
      typeof newValue==='object' ? '변경된 구성' : after,scope,id));
  };
  afterPresets.forEach(next=>{
    const prev=beforePresets.get(next.id);
    if(!prev) return;
    const oldState=prev.state || {},newState=next.state || {};
    const oldValues=oldState.values || {},newValues=newState.values || {};
    if(hasOwn(oldValues,'donationBuffType') && !hasOwn(newValues,'donationBuffType'))
      details.push(traitPresetChangeDetail('donationMigration','기존 중복 저장','통합 저장','common',next.id));
    const valueIds=new Set([...Object.keys(oldValues),...Object.keys(newValues)]);
    valueIds.forEach(id=>{
      // V48까지 일반 입력값에 중복 저장된 성소 정보는 유닛 보드에서만 추적한다.
      if(id==='dpsSanctuaryInfo' || id==='dpsBaseUnitVisibleSlotCount' || id==='donationBuffType' || id==='soloMode' || id==='coopMode') return;
      add(`value:${id}`,oldValues[id],newValues[id],TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(id)?'single':'common',next.id,oldState,newState);
    });
    if(oldValues.soloMode!==newValues.soloMode || oldValues.coopMode!==newValues.coopMode){
      add('value:gameMode',`${oldValues.soloMode}/${oldValues.coopMode}`,`${newValues.soloMode}/${newValues.coopMode}`,'single',next.id,oldState,newState);
    }
    const oldInv=oldState.inv || {},newInv=newState.inv || {};
    const invIds=new Set([...Object.keys(oldInv),...Object.keys(newInv)]);
    invIds.forEach(id=>{
      const before=id==='116' && oldValues.donationBuffType!==undefined ? donationInvestmentFromType(oldValues.donationBuffType) : oldInv[id];
      add(`inv:${id}`,before,newInv[id],id==='116'?'common':'single',next.id,oldState,newState);
    });
    if(stableTraitPresetZeroScore(oldState.zeroScore)!==stableTraitPresetZeroScore(newState.zeroScore))
      details.push(...traitPresetZeroScoreDetailedChanges(oldState.zeroScore,newState.zeroScore,next.id));
    const oldBoard=beforeStore?.unitBoard?.presets?.[next.id];
    const newBoard=afterStore?.unitBoard?.presets?.[next.id];
    const boardKeys=traitPresetUnitBoardChangeKeys(oldBoard,newBoard);
    const beforeSlots=normalizeDpsSanctuaryInfo(oldBoard?.sanctuaryInfo).slots;
    const afterSlots=normalizeDpsSanctuaryInfo(newBoard?.sanctuaryInfo).slots;
    boardKeys.forEach(key=>{
      if(key==='unitBoard'){
        const changed=traitPresetUnitBoardDetailedChanges(oldBoard,newBoard,next.id);
        details.push(...(changed.length ? changed : [traitPresetChangeDetail(key,'이전 보드','변경된 보드','single',next.id)]));
      }else if(key==='sanctuaryInfo:init'){
        details.push(traitPresetChangeDetail(key,'저장 항목 없음',`기본 ${afterSlots.length}슬롯 추가`,'single',next.id));
      }else if(key==='sanctuaryInfo:slotCount'){
        details.push(traitPresetChangeDetail(key,beforeSlots.length,afterSlots.length,'single',next.id));
      }else{
        const [,index,field]=key.split(':');
        const fallback=DPS_SANCTUARY_BLANK_SLOT();
        const oldSlot=beforeSlots[Number(index)] || fallback;
        const newSlot=afterSlots[Number(index)] || fallback;
        const beforeText=field==='range' ? `${oldSlot.start} ~ ${oldSlot.end}` : traitPresetSanctuaryValueText(field,oldSlot[field]);
        const afterText=field==='range' ? `${newSlot.start} ~ ${newSlot.end}` : traitPresetSanctuaryValueText(field,newSlot[field]);
        details.push(traitPresetChangeDetail(key,beforeText,afterText,'single',next.id));
      }
    });
  });
  if(stableTraitPresetValue(beforeStore?.jewelSettings)!==stableTraitPresetValue(afterStore?.jewelSettings))
    details.push(...traitPresetJewelDetailedChanges(beforeStore?.jewelSettings,afterStore?.jewelSettings));
  // 공통 값은 하나만 보여주되 기존 값이 서로 다르면 그 사실을 명시한다.
  const common=new Map(),individual=[];
  details.forEach(row=>{
    if(row.scope!=='common'){individual.push(row);return;}
    const previous=common.get(row.key);
    if(!previous) common.set(row.key,{...row,presetId:''});
    else if(previous.before!==row.before) previous.before='프리셋마다 다름';
  });
  common.forEach(row=>{
    if(row.key.startsWith('value:')){
      const id=row.key.slice(6);
      const previousValues=(beforeStore?.presets || []).map(preset=>preset.state?.values?.[id]);
      const nextValues=afterPresets.map(preset=>preset.state?.values?.[id]);
      if(new Set(previousValues.map(value=>stableTraitPresetValue(value))).size>1) row.before='프리셋마다 다름';
      if(new Set(nextValues.map(value=>stableTraitPresetValue(value))).size>1) row.after='프리셋마다 다름';
    }else if(row.key==='inv:116'){
      const donation=value=>traitPresetDonationDisplay(value?.state?.values?.donationBuffType ?? donationTypeFromInvestment(value?.state?.inv?.[116]));
      if(new Set((beforeStore?.presets || []).map(donation)).size>1) row.before='프리셋마다 다름';
      if(new Set(afterPresets.map(donation)).size>1) row.after='프리셋마다 다름';
    }
  });
  return [...common.values(),...individual];
}
// 비교 화면에만 천 단위 구분자를 표시한다. 저장된 원본 숫자와 코드값은 유지한다.
function traitPresetChangeNumberText(value,key=''){
  const text=String(value);
  if(key==='presetName' || key==='value:enchantCode' || /^[+-]?0\d/.test(text)) return text;
  const numeric=/^([+-]?)(\d+)(\.\d+)?$/.exec(text);
  return numeric ? `${numeric[1]}${numeric[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')}${numeric[3] || ''}` : text;
}
function traitPresetChangeVariation(before,after,key=''){
  if(key==='value:enchantCode') return '변경';
  const numberPattern=/^-?\d+(?:\.\d+)?$/;
  if(!numberPattern.test(before) || !numberPattern.test(after)) return '변경';
  if(!before.includes('.') && !after.includes('.')){
    const delta=BigInt(after)-BigInt(before);
    return traitPresetChangeNumberText(delta>0n ? `+${delta}` : String(delta));
  }
  const delta=Number(after)-Number(before);
  if(!Number.isFinite(delta)) return '변경';
  const rounded=Number(delta.toFixed(8));
  return traitPresetChangeNumberText(rounded>0 ? `+${rounded}` : String(rounded));
}
function stableTraitPresetZeroScore(value){
  return stableTraitPresetValue(normalizeZeroScoreState(value || {rows:[]}));
}
function traitPresetStateChangeSummary(previousState,currentState){
  const previous=normalizeTraitPresetState(previousState);
  const current=normalizeTraitPresetState(currentState);
  const sharedKeys=new Set();
  const singleKeys=new Set();
  const changedValueIds=new Set();
  if(!previous || !current){
    sharedKeys.add('state:shared');
    singleKeys.add('state:single');
    return {stateChanged:true,sharedChanged:true,sharedCount:1,singleCount:1,sharedKeys,singleKeys,changedValueIds};
  }
  const valueIds=new Set([...Object.keys(previous.values || {}), ...Object.keys(current.values || {})]);
  valueIds.forEach(id=>{
    // 슬롯 수는 유닛 보드에서 별도로 비교하므로 기존 프리셋의 누락된 UI 필드를 변경으로 세지 않는다.
    if(id==='dpsBaseUnitVisibleSlotCount') return;
    if(stableTraitPresetValue(previous.values?.[id])===stableTraitPresetValue(current.values?.[id])) return;
    changedValueIds.add(id);
    // 개인전 OFF·협동전 ON은 독립적인 변경 2건이 아니라 '게임 모드' 변경 1건이다.
    if(id==='soloMode' || id==='coopMode') singleKeys.add('value:gameMode');
    else (TRAIT_PRESET_SINGLE_UPDATE_VALUE_IDS.has(id) ? singleKeys : sharedKeys).add(`value:${id}`);
  });
  const previousInv=(previous.inv && typeof previous.inv==='object') ? previous.inv : {};
  const currentInv=(current.inv && typeof current.inv==='object') ? current.inv : {};
  const invRows=new Set([...Object.keys(previousInv), ...Object.keys(currentInv)]);
  invRows.forEach(row=>{
    const before=Math.max(0,Math.round(+previousInv[row] || 0));
    const after=Math.max(0,Math.round(+currentInv[row] || 0));
    if(before!==after) (row==='116' ? sharedKeys : singleKeys).add(`inv:${row}`);
  });
  if(stableTraitPresetZeroScore(previous.zeroScore)!==stableTraitPresetZeroScore(current.zeroScore)) sharedKeys.add('zeroScore');
  return {
    stateChanged:sharedKeys.size>0 || singleKeys.size>0,
    sharedChanged:sharedKeys.size>0,
    sharedCount:sharedKeys.size,
    singleCount:singleKeys.size,
    sharedKeys,
    singleKeys,
    changedValueIds
  };
}
/* ── 07 · 변경 감지·업데이트 ── */
/* 프리셋 업데이트 상태 · 화면값과 저장된 프리셋을 실제 비교 */
let traitPresetChangePromptTimer=0;
function scheduleTraitPresetChangePrompt(event){
  const target=event.target;
  if(!target?.closest || target.closest('.trait-preset-panel,.trait-preset-modal,.trait-preset-backup-overlay')) return;
  if(event.type==='click' && !target.closest('button,[role="button"],[role="switch"],input[type="checkbox"],input[type="radio"],label')) return;
  clearTimeout(traitPresetChangePromptTimer);
  traitPresetChangePromptTimer=setTimeout(()=>{
    traitPresetChangePromptTimer=0;
    if(!selectedTraitPresetId()) return;
    try{
      const store=loadTraitPresetStore();
      renderTraitPresetUpdateStatus(store);
    }catch(error){rememberAppIssue('warn','프리셋 변경 표시 갱신',error);}
  },120);
}

function traitPresetUpdateStatus(store=loadTraitPresetStore()){
  const id=selectedTraitPresetId();
  const preset=store.presets.find(item=>item.id===id);
  if(!preset) return {preset:null,hasChanges:false,sharedCount:0,singleCount:0};
  const state=markPresetStateCurrentVersion(makeStateObject());
  const summary=traitPresetStateChangeSummary(preset.state,state);
  const boardChanged=!traitPresetHasUnitBoard(store,id)
    || stableTraitPresetValue(traitPresetUnitBoardState(store,id))!==stableTraitPresetValue(captureTraitPresetUnitBoardState());
  const jewelChanged=traitPresetJewelSettingsChanged(store);
  return {
    preset,
    hasChanges:summary.stateChanged || boardChanged || jewelChanged,
    sharedCount:summary.sharedCount+(jewelChanged ? 1 : 0),
    singleCount:summary.singleCount+(boardChanged ? 1 : 0)
  };
}
let traitPresetDetectedAt=0, traitPresetDetectedId='';
function traitPresetDisplayTime(timestamp){
  if(!timestamp) return '';
  const date=new Date(timestamp);
  if(!Number.isFinite(date.getTime())) return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function renderTraitPresetUpdateStatus(store=loadTraitPresetStore(),status=loadTraitPresetStatusData()){
  const compatibility=storedTraitPresetCompatibility();
  const appliedId=String(status.selectedTraitPresetId || '');
  const hasApplied=store.presets.some(preset=>preset.id===appliedId);
  const current=(!compatibility.error && !compatibility.requiresUpdate && hasApplied && selectedTraitPresetId()===appliedId) ? traitPresetUpdateStatus(store) : {preset:null,hasChanges:false};
  const currentId=current.preset?.id || '';
  const hasChanges=!!current.preset && current.hasChanges;
  if(hasChanges){
    if(traitPresetDetectedId!==currentId || !traitPresetDetectedAt){traitPresetDetectedId=currentId;traitPresetDetectedAt=Date.now();}
  }else{traitPresetDetectedId='';traitPresetDetectedAt=0;}
  const updateReady=hasChanges;
  const backup=store.presets.length>0 && (status.backupNeeded || status.updatedPresetIds.length>0 || status.pendingUnitBoardPresetIds.length>0);
  const needsApply=!hasApplied && store.presets.length>0 && !compatibility.error && !compatibility.requiresUpdate;
  const type=compatibility.error?'error':compatibility.requiresUpdate?'migration':hasChanges?'changed':!hasApplied?'empty':backup?'backup':'normal';
  const displayType=type==='empty' && store.presets.length?'unloaded':type;
  const statusCopy={
    empty:['저장된 프리셋이 없습니다.','가져오거나 새로 저장해 주세요.'],
    unloaded:['적용된 프리셋이 없습니다.','목록에서 프리셋을 선택하고 적용해 주세요.'],
    normal:['프리셋 정상 상태','저장된 설정과 현재 설정이 일치합니다.'],
    changed:['프리셋 업데이트 감지됨','변경사항을 반영하거나 되돌릴 수 있습니다.'],
    backup:['프리셋 백업 필요','변경된 프리셋을 파일로 백업해 주세요.'],
    migration:['프리셋 최신화 필요','백업 버튼을 눌러 최신화해 주세요.'],
    error:['프리셋 데이터 오류','제작자 문의를 통해 확인해 주세요.']
  }[displayType];
  const statusView=$('traitPresetFirstUse');
  if(statusView && statusView.dataset.status!==displayType){
    statusView.dataset.status=displayType;
    statusView.querySelector('use')?.setAttribute('href',`#traitPresetGlyph-${displayType}`);
    statusView.querySelector('strong').textContent=statusCopy[0];
    statusView.querySelector('small').textContent=statusCopy[1];
  }
  const message=compatibility.error || statusCopy[0];
  const detected=hasChanges?traitPresetDisplayTime(traitPresetDetectedAt):'';
  const warning=compatibility.requiresUpdate || !!compatibility.error;
  const description=[message,detected,backup && type!=='backup'?'백업 필요':''].filter(Boolean).join(' · ');
  const btn=document.getElementById('btnGlobalPreset');
  if(btn){
    btn.dataset.status=type;
    btn.setAttribute('aria-label',`프리셋 · ${description}`);
    btn.title=description;
    const mark=btn.querySelector('i');if(mark) mark.textContent=warning?'!':'';
  }
  qsa('[data-action="updateTraitPreset"]').forEach(btn=>{
    btn.classList.toggle('is-change-ready',updateReady);
    btn.disabled=!current.preset || !!compatibility.error || compatibility.requiresUpdate;
    btn.title=hasChanges?`프리셋 업데이트 감지됨 · ${detected}`:'현재 변경사항 반영';
    btn.setAttribute('aria-label',btn.title);
  });
  qsa('[data-action="loadTraitPreset"]').forEach(btn=>{
    btn.classList.toggle('is-load-ready',hasChanges || needsApply);
    const label=btn.querySelector('.trait-preset-button-copy strong');
    if(label) label.textContent=hasChanges?'되돌리기':'적용';
    const path=btn.querySelector('svg path');
    if(path) path.setAttribute('d',hasChanges?'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2':'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3');
    btn.title=hasChanges?'저장된 설정으로 되돌리기':'프리셋 적용';
    btn.setAttribute('aria-label',hasChanges?'프리셋 되돌리기':'프리셋 적용');
  });
  qsa('[data-action="backupTraitPresets"]').forEach(btn=>{
    btn.classList.toggle('is-backup-needed',backup);
    btn.classList.toggle('is-migration-needed',compatibility.requiresUpdate);
    btn.title=compatibility.requiresUpdate?'프리셋 최신화 필요':backup?'변경사항 백업 필요':'프리셋 최신화 및 백업';
    btn.setAttribute('aria-label',btn.title);
    const mark=btn.querySelector('.preset-command-indicator');if(mark) mark.textContent=compatibility.requiresUpdate?'!':'';
  });
  return updateReady;
}
function requestTraitPresetUpdate(){
  const compatibility=storedTraitPresetCompatibility();
  if(compatibility.error){renderTraitPresetOperationError('업데이트',compatibility.error);return false;}
  if(compatibility.requiresUpdate) return openTraitPresetBackupPanel();
  const store=loadTraitPresetStore();
  if(!selectedTraitPresetId() || loadTraitPresetStatusData().selectedTraitPresetId!==selectedTraitPresetId()) return false;
  const current=traitPresetUpdateStatus(store);
  if(!current.hasChanges || !current.sharedCount){
    const ok=updateTraitPreset();
    if(current.hasChanges && !ok) renderTraitPresetOperationError('업데이트','변경사항을 적용하지 못했습니다. 기존 프리셋 상태를 확인해 주세요.');
    return ok;
  }
  try{
    const preview=traitPresetBackupChangePlan(store,makeStateObject(),{currentOnly:true});
    traitPresetBackupPanelPlan={...preview,mode:'update'};
    showTraitPresetUnifiedPanel(traitPresetBackupPanelPlan);
    return true;
  }catch(error){renderTraitPresetOperationError('업데이트',error?.message || '업데이트 검토 실패');return false;}
}
function updateTraitPreset(options={}){
  const compatibility=storedTraitPresetCompatibility();
  if(compatibility.error){
    if(options.silent!==true) notifyStorageAction(compatibility.error,'err');
    return false;
  }
  if(compatibility.requiresUpdate){
    if(options.silent!==true) notifyStorageAction('백업 버튼에서 프리셋 최신화를 먼저 완료해 주세요.','warn');
    return false;
  }
  const id=options.id || selectedTraitPresetId();
  let store=loadTraitPresetStore();
  const selectedIndex=store.presets.findIndex(item=>item.id===id);
  const preset=store.presets[selectedIndex];
  if(!preset){ if(options.silent!==true) notifyStorageAction('업데이트할 프리셋을 선택하세요.','err'); return false; }
  let snapshot=null;
  try{
    const now=Date.now();
    const localState={...makeStateObject(),savedAt:now};
    const currentState=markPresetStateCurrentVersion(localState);
    if(!currentState) throw new Error('현재 화면값을 프리셋 상태로 저장할 수 없습니다.');
    const currentUnitBoard=captureTraitPresetUnitBoardState();
    const currentJewelSettings=captureTraitPresetJewelSettings();
    const stateChangeSummary=traitPresetStateChangeSummary(preset.state,currentState);
    const stateChanged=stateChangeSummary.stateChanged;
    const statusCommonChangeKeys=new Set(stateChangeSummary.sharedKeys);
    const statusSingleChangeKeys=new Set(stateChangeSummary.singleKeys);
    const unitBoardChanges=traitPresetUnitBoardChangeKeys(traitPresetUnitBoardState(store,id),currentUnitBoard);
    const unitBoardChanged=!traitPresetHasUnitBoard(store,id) || unitBoardChanges.length>0;
    const jewelChanged=traitPresetJewelSettingsChanged(store);
    if(unitBoardChanged) (unitBoardChanges.length ? unitBoardChanges : ['unitBoard']).forEach(key=>statusSingleChangeKeys.add(key));
    if(jewelChanged) statusCommonChangeKeys.add('jewelSettings');
    if(!stateChanged && !unitBoardChanged && !jewelChanged){

      if(options.refresh!==false) renderTraitPresetUpdateStatus(store);
      if(options.silent!==true) notifyStorageAction('프리셋 변경사항 없음','warn');
      return false;
    }
    snapshot=captureTraitPresetMutationSnapshot();
    storageState.presetMutationInProgress=true;
    const syncSharedValues=stateChangeSummary.sharedChanged;
    const updatedIds=[];
    store.presets=store.presets.map((item,index)=>{
      let nextState=item.state;
      if(index===selectedIndex && stateChanged) nextState=currentState;
      else if(index!==selectedIndex && syncSharedValues) nextState=buildSyncedTraitPresetState(currentState,item.state,stateChangeSummary.sharedKeys);
      const changed=(index===selectedIndex && (stateChanged || unitBoardChanged)) || jewelChanged || (index!==selectedIndex && syncSharedValues && nextState && stableTraitPresetValue(nextState)!==stableTraitPresetValue(item.state));
      if(!changed || !nextState) return item;
      updatedIds.push(item.id);
      return {...item,updatedAt:now,meta:traitPresetMetaFromSavedState(nextState),state:nextState};
    });
    setTraitPresetUnitBoardState(store,id,currentUnitBoard);
    store.jewelSettings=currentJewelSettings;
    store=saveTraitPresetStore(store,{source:'updateTraitPreset'});
    clearTraitPresetDraft(id);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(localState));
    storageState.hasSavedState=true;
    const statusIds=new Set(updatedIds.length ? updatedIds : [id]);
    if(jewelChanged) store.presets.forEach(item=>statusIds.add(item.id));
    
    const beforeStore=safeJsonParse(snapshot.storage.find(([key])=>key===TRAIT_PRESET_STORAGE_KEY)?.[1]);
    markTraitPresetUpdated([...statusIds],'update',{commonChangeKeys:[...statusCommonChangeKeys],commonPresetIds:statusCommonChangeKeys.size ? store.presets.map(item=>item.id) : [],singleChangeKeys:[...statusSingleChangeKeys],singlePresetIds:statusSingleChangeKeys.size ? [id] : [],beforeStore,afterStore:store});
    updateTraitPresetStatus({pendingJewelSettings:false},{persist:true});

    if(options.rememberSelection!==false) finishTraitPresetSelection(id,{refresh:options.refresh!==false});
    else if(options.refresh!==false) refreshTraitPresetControls(id);
    if(options.silent!==true) notifyStorageAction(`프리셋 업데이트 완료: ${preset.name}`,'ok',{toast:true,skipHeaderStatus:true});
    return true;
  }catch(e){
    restoreTraitPresetMutationSnapshot(snapshot,'[trait preset update rollback failed]');
    rememberAppIssue('error','[trait preset update failed]',e);
    notifyStorageAction(e?.message || '프리셋 업데이트 실패','err');
    return false;
  }finally{
    storageState.presetMutationInProgress=false;
  }
}
/* ── 08 · 임시 변경 ── */
/* 프리셋 임시 변경 */
function rememberTraitPresetDraft(id){
  const compatibility=storedTraitPresetCompatibility();
  if(compatibility.error || compatibility.requiresUpdate) return false;
  const draftId=String(id || '').trim();
  if(!draftId) return false;
  const store=loadTraitPresetStore();
  const preset=store.presets.find(item=>item.id===draftId);
  if(!preset) return false;
  const state=markPresetStateCurrentVersion(makeStateObject());
  if(!state) return false;
  const unitBoard=captureTraitPresetUnitBoardState();
  const stateChanged=traitPresetStateChangeSummary(preset.state,state).stateChanged;
  const unitBoardChanged=traitPresetHasUnitBoard(store,draftId) && stableTraitPresetValue(traitPresetUnitBoardState(store,draftId))!==stableTraitPresetValue(unitBoard);
  const drafts=loadTraitPresetDrafts();
  if(stateChanged || unitBoardChanged){
    drafts[draftId]={state};
    if(unitBoardChanged) drafts[draftId].unitBoard=unitBoard;
  }else delete drafts[draftId];
  saveTraitPresetDrafts(drafts);
  return stateChanged || unitBoardChanged;
}
function applyTraitPresetDraftsToStore(store,baseline,selectedId,currentState,currentSharedKeys){
  const drafts=loadTraitPresetDrafts();
  const now=Date.now();
  Object.entries(drafts).forEach(([id,draft])=>{
    if(id===selectedId) return;
    const original=baseline.presets.find(preset=>preset.id===id);
    const target=store.presets.find(preset=>preset.id===id);
    const state=markPresetStateCurrentVersion(draft?.state);
    if(!original || !target || !state) return;
    const summary=traitPresetStateChangeSummary(original.state,state);
    const changedShared=new Set([...summary.sharedKeys].filter(key=>!currentSharedKeys.has(key)));
    if(summary.stateChanged){
      // 개별 변경은 임시본에서, 변경하지 않은 공통 설정은 현재 통합본에서 가져온다.
      target.state=buildSyncedTraitPresetState(target.state,state,traitPresetSharedStateKeys(target.state));
      target.updatedAt=now;
      target.meta=traitPresetMetaFromSavedState(target.state);
    }
    if(changedShared.size) store.presets.forEach(item=>{
      item.state=buildSyncedTraitPresetState(state,item.state,changedShared);
      item.updatedAt=now;item.meta=traitPresetMetaFromSavedState(item.state);
    });
    if(draft.unitBoard) setTraitPresetUnitBoardState(store,id,normalizeTraitPresetUnitBoardState(draft.unitBoard));
  });
  if(currentSharedKeys.size) store.presets.forEach(item=>{
    item.state=buildSyncedTraitPresetState(currentState,item.state,currentSharedKeys);
    item.updatedAt=now;item.meta=traitPresetMetaFromSavedState(item.state);
  });
  return store;
}
function updateTraitPresetBeforeSelectionChange(nextId){
  const previousId=loadTraitPresetStatusData().selectedTraitPresetId;
  const normalizedNextId=String(nextId || '').trim();
  if(!previousId || previousId===normalizedNextId) return true;
  rememberTraitPresetDraft(previousId);
  return true;
}
function deleteTraitPreset(targetId=''){
  const id=String(typeof targetId==='string' ? targetId : '').trim() || selectedTraitPresetId();
  const currentStore=loadTraitPresetStore();
  const preset=currentStore.presets.find(item=>item.id===id);
  if(!preset){ notifyStorageAction('삭제할 프리셋을 찾지 못했습니다.','err'); return false; }
  return requestConfirmAction(`deleteTraitPreset:${id}`,`한 번 더 누르면 프리셋 삭제: ${preset.name}`,()=>{
    let snapshot=null;
    try{
      snapshot=captureTraitPresetMutationSnapshot();
      const previouslySelectedId=selectedTraitPresetId();
      let nextStore=loadTraitPresetStore();
      // 두 번째 클릭까지 다른 작업을 했다면 오래된 삭제 요청을 실행하지 않습니다.
      if(!nextStore.presets.some(item=>item.id===id)) throw new Error('삭제할 프리셋이 이미 없습니다.');
      nextStore.presets=nextStore.presets.filter(item=>item.id!==id);
      deleteTraitPresetUnitBoardState(nextStore,id);
      clearTraitPresetDraft(id);
      saveTraitPresetStore(nextStore,{source:'deleteTraitPreset'});
      markTraitPresetUpdated([],'delete');
      // 선택되지 않은 행의 삭제는 현재 화면 수치와 작업 중인 프리셋을 유지합니다.
      const selectedRemains=nextStore.presets.some(item=>item.id===previouslySelectedId);
      if(selectedRemains){
        rememberTraitPresetSelection(previouslySelectedId);
        refreshTraitPresetControls(previouslySelectedId);
      }else{
        const nextId=resolveTraitPresetSelection(nextStore);
        rememberTraitPresetSelection('');
        if(nextId){
          const loaded=loadTraitPresetById(nextId,{
            notifySuccess:false,preserveSharedValues:false,useDraft:false,discardDraft:true
          });
          if(!loaded) throw new Error('다음 프리셋 적용에 실패해 삭제를 취소했습니다.');
        }else refreshTraitPresetControls('');
      }
      
      notifyStorageAction(`프리셋 삭제 완료: ${preset.name}`,'ok',{statusAction:'delete',toast:true});
      return true;
    }catch(e){
      restoreTraitPresetMutationSnapshot(snapshot,'[trait preset delete rollback failed]');
      rememberAppIssue('error','[trait preset delete failed]',e);
      notifyStorageAction(e?.message || '프리셋 삭제 실패','err');
      return false;
    }
  });
}
function resetToFirstVisitState(){
  try{
    try{
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TRAIT_PRESET_STORAGE_KEY);
      localStorage.removeItem(TRAIT_PRESET_STATUS_STORAGE_KEY);
      localStorage.removeItem(TRAIT_PRESET_DRAFT_STORAGE_KEY);
    }catch(error){
      rememberAppIssue('warn','전체 저장 데이터 제거', error);
    }
    resetToFactoryState();
    refreshTraitPresetControls('');
    clearTraitPresetUpdatedStatus('latest');
    resetTraitPresetNameInput();
    
    
    openTraitPresetManagerIfUnloaded();
    notifyStorageAction('프리셋 초기화 완료','ok');
    return true;
  }catch(e){
    rememberAppIssue('error','[full reset failed]',e);
    notifyStorageAction(e?.message || '프리셋 초기화 실패','err');
    return false;
  }
}
let traitPresetResetButtonTimer=0;
function resetTraitPresetResetButton(trigger){
  const btn=trigger || $('traitPresetResetAllBtn');
  if(!btn) return;
  btn.dataset.confirming='0';
  btn.classList.remove('is-confirming');
  btn.removeAttribute('aria-description');
}
function requestTraitPresetFullReset(trigger){
  if(!loadTraitPresetStore().presets.length) return false;
  const btn=trigger || $('traitPresetResetAllBtn');
  const delay=DPS_CONFIG.ui.confirmDelayMs || 1600;
  if(btn?.dataset.confirming==='1'){
    clearTimeout(traitPresetResetButtonTimer);
    resetTraitPresetResetButton(btn);
    return resetToFirstVisitState();
  }
  if(btn){
    btn.dataset.confirming='1';
    btn.classList.add('is-confirming');
    btn.setAttribute('aria-description','초기화하려면 제한 시간 안에 같은 버튼을 한 번 더 누르세요.');
    clearTimeout(traitPresetResetButtonTimer);
    traitPresetResetButtonTimer=setTimeout(()=>resetTraitPresetResetButton(btn), delay);
  }
  notifyStorageAction('한 번 더 누르면 프리셋 초기화','warn');
  return false;
}
/* ── 09 · UI 이벤트 ── */
/* 프리셋 UI 이벤트 바인딩 */
function toggleTraitPresetManager(){
  const overlay=$('traitPresetManagerOverlay');
  if(!overlay || DPS_ROOT.hidden) return;
  if(!overlay.hidden){closeTraitPresetManager(true);return;}
  openTraitPresetManager();
}
function openTraitPresetManager(){
  const overlay=$('traitPresetManagerOverlay');
  if(window.NEXUS_WINDOW_MODE!=='main' || !overlay || DPS_ROOT.hidden || !overlay.hidden) return;
  renderTraitPresetUpdateStatus();
  overlay.hidden=false;
  document.getElementById('btnGlobalPreset')?.setAttribute('aria-expanded','true');
  overlay.querySelector('.trait-preset-panel')?.focus({preventScroll:true});
}
function openTraitPresetManagerIfUnloaded(){
  if(window.NEXUS_WINDOW_MODE!=='main' || DPS_ROOT.hidden) return;
  const store=loadTraitPresetStore();
  const id=loadTraitPresetStatusData().selectedTraitPresetId;
  if(!store.presets.some(preset=>preset.id===id)) openTraitPresetManager();
}
function closeTraitPresetManager(restoreFocus=false){
  if(traitPresetBackupLocked) return false;
  if($('traitPresetBackupPanel')?.classList.contains('is-open')) closeTraitPresetBackupPanel();
  const overlay=$('traitPresetManagerOverlay');
  if(overlay) overlay.hidden=true;
  closeTraitPresetCustomSelects();
  const trigger=document.getElementById('btnGlobalPreset');
  trigger?.setAttribute('aria-expanded','false');
  clearTimeout(traitPresetResetButtonTimer);
  resetTraitPresetResetButton();
  if(restoreFocus===true && trigger && !trigger.hidden) trigger.focus({preventScroll:true});
  return true;
}
function handleTraitPresetChange(e){
  if(e.target?.id==='traitPresetSelect'){
    updateTraitPresetBeforeSelectionChange(e.target.value);
    loadTraitPresetById(e.target.value,{preserveSharedValues:false,useDraft:false,discardDraft:true});
  }
  if(e.target?.id==='traitPresetImportFile' && e.target.files?.[0]){
    const file=e.target.files[0];
    importTraitPresetFile(file).finally(()=>resetTraitPresetImportInput(e.target));
  }
}
function handleTraitPresetClick(e){
  if(e.target.id==='traitPresetManagerOverlay' || e.target.closest('[data-trait-preset-manager-close]')){closeTraitPresetManager(true);return;}
  if(e.target.closest('[data-trait-preset-error-copy]')){
    const issue=window.DPS_LAST_ISSUE;
    const text=`${currentWebDpsVersion()} | ${$('traitPresetBackupTitle')?.textContent} | ${traitPresetDisplayTime(issue?.time || Date.now())} | ${issue?.label || '프리셋 작업 실패'}`;
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(()=>showToast('오류 정보 복사 완료','ok')).catch(()=>showToast('복사할 수 없습니다.','warn'));
    else showToast('클립보드를 사용할 수 없습니다.','warn');
    return;
  }
  if(e.target.closest('[data-trait-preset-support]')){document.getElementById('creatorInfoDialog')?.showModal();return;}
  const deleteButton=e.target.closest('[data-trait-preset-custom-delete]');
  if(deleteButton){
    e.preventDefault();
    e.stopPropagation();
    const id=deleteButton.dataset.traitPresetCustomDelete;
    // 삭제 버튼은 선택 동작과 독립적이며 삭제 확인은 기존 2회 클릭 규칙을 따릅니다.
    const done=deleteTraitPreset(id);
    if(done) closeTraitPresetCustomSelects();
    else{
      deleteButton.classList.add('is-confirming');
      deleteButton.setAttribute('aria-label','삭제 확인 · 다시 누르면 해당 프리셋이 삭제됩니다');
      setTimeout(()=>{
        if(!deleteButton.isConnected) return;
        deleteButton.classList.remove('is-confirming');
        deleteButton.setAttribute('aria-label','이 프리셋 삭제 (두 번 누르면 삭제)');
      },DPS_CONFIG.ui.confirmDelayMs || 1600);
    }
    return;
  }
  const customButton=e.target.closest('[data-trait-preset-custom-button]');
  if(customButton){
    e.preventDefault();
    e.stopPropagation();
    const custom=customButton.closest('[data-trait-preset-custom-select]');
    if(custom?.classList.contains('is-open')) closeTraitPresetCustomSelect(custom);
    else openTraitPresetCustomSelect(custom);
    return;
  }
  const customOption=e.target.closest('[data-trait-preset-custom-option]');
  if(customOption){
    e.preventDefault();
    e.stopPropagation();
    const custom=customOption.closest('[data-trait-preset-custom-select]');
    const select=$(custom?.dataset?.traitPresetCustomSelect || '');
    if(select && !customOption.disabled){
      select.value=customOption.dataset.value || '';
      syncTraitPresetCustomSelect(select);
      closeTraitPresetCustomSelect(custom);
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return;
  }
  if(!e.target.closest('[data-trait-preset-custom-select]')) closeTraitPresetCustomSelects();
  if(e.target.id==='traitPresetBackupOverlay'){
    closeTraitPresetBackupPanel();
    return;
  }
  if(e.target.closest('[data-trait-preset-backup-close]')){
    closeTraitPresetBackupPanel();
    return;
  }
  const backupRun=e.target.closest('[data-trait-preset-backup-run]');
  if(backupRun){
    e.preventDefault();
    e.stopPropagation();
    runTraitPresetBackup();
  }
}
function handleTraitPresetKeydown(e){
  if(document.getElementById('creatorInfoDialog')?.open) return;
  const backupPanel=$('traitPresetBackupPanel');
  if(backupPanel?.classList.contains('is-open')){
    if(e.key==='Escape'){
      e.preventDefault();
      closeTraitPresetBackupPanel();
      return;
    }
    if(e.key==='Tab'){
      const focusable=[...backupPanel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length);
      if(!focusable.length){e.preventDefault();backupPanel.focus();return;}
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey && (document.activeElement===first || document.activeElement===backupPanel)){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      else if(!backupPanel.contains(document.activeElement)){e.preventDefault();first.focus();}
    }
    return;
  }
  const manager=$('traitPresetManagerOverlay');
  if(manager && !manager.hidden){
    if(e.key==='Escape' && !e.target.closest('[data-trait-preset-custom-select]')){e.preventDefault();closeTraitPresetManager(true);return;}
    if(e.key==='Tab'){
      const controls=[...manager.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if(first && last && ((e.shiftKey && (document.activeElement===first || !controls.includes(document.activeElement))) || (!e.shiftKey && document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus();return;}
    }
  }
  const customButton=e.target.closest?.('[data-trait-preset-custom-button]');
  if(customButton && ['Enter',' ','ArrowDown'].includes(e.key)){
    e.preventDefault();
    const custom=customButton.closest('[data-trait-preset-custom-select]');
    openTraitPresetCustomSelect(custom);
    const current=custom?.querySelector('.trait-preset-custom-option.is-selected:not(:disabled)') || custom?.querySelector('.trait-preset-custom-option:not(:disabled)');
    current?.focus();
    return;
  }
  const customOption=e.target.closest?.('[data-trait-preset-custom-option]');
  if(customOption && ['ArrowDown','ArrowUp','Escape'].includes(e.key)){
    e.preventDefault();
    const custom=customOption.closest('[data-trait-preset-custom-select]');
    if(e.key==='Escape'){
      closeTraitPresetCustomSelect(custom);
      custom?.querySelector('[data-trait-preset-custom-button]')?.focus();
      return;
    }
    const options=[...custom.querySelectorAll('.trait-preset-custom-option:not(:disabled)')];
    const index=options.indexOf(customOption);
    const next=options[index + (e.key==='ArrowDown'?1:-1)] || options[e.key==='ArrowDown'?0:options.length-1];
    next?.focus();
    return;
  }
}
let traitPresetEventsBound=false;
function bindTraitPresetEvents(){
  if(traitPresetEventsBound) return;
  DPS_BODY.addEventListener('change',handleTraitPresetChange);
  DPS_BODY.addEventListener('click',handleTraitPresetClick);
  DPS_BODY.addEventListener('keydown',handleTraitPresetKeydown);
  DPS_BODY.addEventListener('input',scheduleTraitPresetChangePrompt);
  DPS_BODY.addEventListener('change',scheduleTraitPresetChangePrompt);
  DPS_BODY.addEventListener('click',scheduleTraitPresetChangePrompt);
  traitPresetEventsBound=true;
}

/* ── 10 · 공개 API ── */
/* 공개 API */
window.DpsPreset=Object.freeze({
  init:function(){
    try{localStorage.removeItem('gbd_dps_calculator:trait_preset_guide');}catch{}
    refreshTraitPresetControls();
    restoreTraitPresetStatus();
    openTraitPresetManagerIfUnloaded();
  },
  bindEvents:bindTraitPresetEvents,
  saveCurrent:saveTraitPreset,
  loadSelected:loadTraitPreset,
  updateCurrent:requestTraitPresetUpdate,
  toggleManager:toggleTraitPresetManager,
  openIfUnloaded:openTraitPresetManagerIfUnloaded,
  closeManager:closeTraitPresetManager,
  deleteCurrent:deleteTraitPreset,
  resetAll:requestTraitPresetFullReset,
  openImport:openTraitPresetImportPicker,
  openBackup:openTraitPresetBackupPanel
});
