/* 빌더 앱 제어: 공통 상태·입력·계산 연동·보드·이벤트 (14개 기능 섹션) */
/* ── 01 · 설정·공통 상태 ── */
const DPS_CONFIG={
  storage:{
    version:(window.DPS_BUILD_VERSION || 'dev'),
    scope:'browser_local',
    key:'gbd_dps_calculator:personal_state',
    fontKey:'nexusFontScaleV2',
    clientKey:'gbd_dps_calculator:client_id',
    traitPresetKey:'gbd_dps_calculator:trait_presets',
    traitPresetStatusKey:'gbd_dps_calculator:trait_preset_status'
  },

  state:{
    skipElementIds:['ep','artifactDpsViewToggle']
  },

  dpsTable:DPS_TABLE_UI_RULES,

  ui:{
    updateDelay:16,
    confirmDelayMs:1600,
    traitHoldInitialDelay:320,
    traitHoldRepeatMs:55,
    traitHoldAccelEvery:7,
    traitHoldMaxStep:50,
    fontScaleDefault:1,
    fontScaleMin:0.8,
    fontScaleMax:2,
    fontScaleStep:0.05,
    mobileMaxWidth:600
  }
};

let calculationElementOverrides=null;
function withCalculationElementOverrides(ids,callback){
  const previous=calculationElementOverrides;
  const next=previous ? new Map(previous) : new Map();
  (ids || []).forEach(id=>{
    const real=id ? DPS_BODY.querySelector('#'+CSS.escape(String(id))) : null;
    if(!real) return;
    const clone=real.cloneNode(true);
    if('value' in real) clone.value=real.value;
    if('checked' in real) clone.checked=real.checked;
    if('indeterminate' in real) clone.indeterminate=real.indeterminate;
    next.set(id,clone);
  });
  calculationElementOverrides=next;
  try{return callback();}
  finally{calculationElementOverrides=previous;}
}
const $=id=>calculationElementOverrides?.get(id) || (id ? DPS_BODY.querySelector('#'+CSS.escape(String(id))) : null);
const qs=selector=>DPS_BODY.querySelector(selector);
const qsa=selector=>DPS_BODY.querySelectorAll(selector);
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, char=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
}

const INV={};
TRAITS.forEach(t=>{INV[t[0]]=0;});
function appliedTraitInvestment(row){return INV[row]||0;}
const ENCHANT_INPUT_IDS=['enchAD','enchCRI','enchUA','enchTD','enchSR','enchHR'];
const ENCHANT_INPUT_ID_SET=new Set(ENCHANT_INPUT_IDS);

/* ── 02 · 공통 UI·입력 유틸리티 ── */
function rememberAppIssue(kind,label,error){
  window.DPS_LAST_ISSUE={kind,label,error,time:Date.now()};
}
function alertApp(message){
  showToast(String(message ?? ''),'err',5600);
}
function showToast(message, type='ok', durationMs, title){
  try{
    const root=$('toastRoot');
    if(!root) return;
    const text=String(message ?? '').trim();
    if(!text) return;
    const heading=title || ({ok:'작업 완료',warn:'확인 필요',err:'작업 실패'}[type] || '안내');
    const toastKey=JSON.stringify([type,heading,text]);
    if([...root.children].some(item=>item.dataset.toastKey===toastKey)) return;
    while(root.children.length>=4) root.firstElementChild?.remove();
    const el=document.createElement('div');
    el.className='toast '+type;
    el.dataset.toastKey=toastKey;
    const glyph=({ok:'normal',warn:'migration',err:'error'}[type] || 'unloaded');
    el.innerHTML=`<svg class="toast-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#traitPresetGlyph-${glyph}"/></svg><div class="toast-copy" role="status"><strong></strong><span></span></div><button type="button" class="toast-close" aria-label="알림 닫기">×</button>`;
    el.querySelector('strong').textContent=heading;
    el.querySelector('.toast-copy span').textContent=text;
    root.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    const requestedMs=Number(durationMs);
    const visibleMs=Number.isFinite(requestedMs) && requestedMs>0 ? requestedMs : (type==='err'||text.includes('\n') ? 5600 : type==='warn'?4000:3000);
    const timer=setTimeout(dismiss,visibleMs);
    function dismiss(){
      clearTimeout(timer);
      if(!el.isConnected || el.dataset.dismissed) return;
      el.dataset.dismissed='1';
      el.classList.remove('show');
      setTimeout(()=>el.remove(),220);
    }
    el.querySelector('button').addEventListener('click',dismiss,{once:true});
  }catch(error){
    rememberAppIssue('warn','showToast',error);
  }
}
const inlineFeedbackTimers=new WeakMap();
function showInlineFeedback(host,message,type='warn'){
  if(!host) return;
  let note=host.querySelector(':scope > .ui-inline-feedback');
  if(!note){
    note=document.createElement('div');
    note.className='ui-inline-feedback';
    note.setAttribute('role','status');
    host.appendChild(note);
  }
  const old=inlineFeedbackTimers.get(host);
  if(old) clearTimeout(old);
  note.dataset.type=type;
  if(note.textContent!==message) note.textContent=message;
  inlineFeedbackTimers.set(host,setTimeout(()=>{note.remove();inlineFeedbackTimers.delete(host);},4000));
}
let pendingConfirmAction=null;
function clearConfirmAction(){
  if(!pendingConfirmAction) return;
  const {timer,trigger,label,original,description}=pendingConfirmAction;
  clearTimeout(timer);
  if(trigger){
    trigger.classList.remove('is-confirming');
    if(label) label.textContent=original;
    if(description===null) trigger.removeAttribute('aria-description');
    else trigger.setAttribute('aria-description',description);
  }
  pendingConfirmAction=null;
}
function requestConfirmAction(key,message,run,trigger=null){
  const now=Date.now();
  const delay=DPS_CONFIG.ui.confirmDelayMs || 1600;
  if(pendingConfirmAction && pendingConfirmAction.key===key && pendingConfirmAction.trigger===trigger && now<pendingConfirmAction.until){
    clearConfirmAction();
    return run();
  }
  clearConfirmAction();
  const label=trigger?.matches('.ui-reset-btn') ? trigger.querySelector(':scope > span') : null;
  pendingConfirmAction={key,trigger,label,original:label?.textContent,description:trigger?.getAttribute('aria-description'),until:now+delay,timer:setTimeout(clearConfirmAction,delay)};
  if(trigger){
    trigger.classList.add('is-confirming');
    trigger.setAttribute('aria-description',message);
    if(label) label.textContent=trigger.id==='traitPresetResetAllBtn'?'재확인':'다시 누르세요';
  }
  if(trigger?.closest('#traitPresetManagerOverlay')||key.startsWith('restoreTraitPreset:')||key.startsWith('deleteTraitPreset:')||key==='resetAllTraitPresetState') showTraitPresetFeedback('프리셋 확인',message,'warn',{durationMs:delay});
  return false;
}

function v(id){
  const el=$(id); if(!el) return 0;
  if(id==='round') return normalizedRoundNumber(targetRoundStoredValue());
  if(id==='challengeTowerFloor') return normalizedTowerFloorNumber(challengeTowerFloorStoredValue());
  if(id==='planetExplorationFloor') return normalizedPlanetExplorationFloorNumber(planetExplorationFloorStoredValue());
  if(id==='penance') return effectivePenanceValue();
  if(id==='pbless') return effectivePowerBlessValue();
  const raw=String(el.value??'').replace(/,/g,'').trim();
  if(id==='skillRound') return normalizedSkillRoundNumber(raw);
  return +raw||0;
}
function vs(id){const el=$(id); return el ? el.value : '';}
function normalizeXpInput(){
  const el=$('xp');
  if(!el) return 1;
  const n=Math.max(1, v('xp'));
  if(v('xp')!==n) el.value=String(n.toLocaleString('ko-KR'));
  return n;
}
function setElementProp(id, prop, value){const el=$(id); const next=value==null?'':String(value); if(el && el[prop]!==next) el[prop]=next;}
function setHTMLIfChanged(el,html){if(el && el._renderHTML!==html){el.innerHTML=html;el._renderHTML=html;}}
function setText(id,val){setElementProp(id,'textContent',val);}
function setValue(id,val){setElementProp(id,'value',String(val));}
function setSelectOptions(select, options){
  if(!select) return;
  select.innerHTML='';
  options.forEach(({value,label,selected=false})=>{
    const option=document.createElement('option');
    option.value=String(value);
    option.textContent=String(label ?? value);
    option.selected=!!selected;
    select.appendChild(option);
  });
}
function syncSelectOptionsBySignature(select, signature, options, signatureKey='optionSignature'){
  if(!select) return;
  if(select.dataset[signatureKey]!==signature){
    setSelectOptions(select, options);
    select.dataset[signatureKey]=signature;
  }
}
function normalizedUnsignedDigits(value, fallback='0'){
  const digits=String(value ?? '').replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,'');
  return digits || fallback;
}
function clampedIntegerString(value, min, max, fallback=0){
  const digits=normalizedUnsignedDigits(value, '');
  const number=digits ? Number(digits) : fallback;
  const finite=Number.isFinite(number) ? Math.round(number) : fallback;
  return String(Math.max(min, Math.min(max, finite)));
}
function setClassState(el, classNames, active){
  if(!el) return;
  const names=Array.isArray(classNames) ? classNames : [classNames];
  names.forEach(name=>el.classList.toggle(name, !!active));
}
function setTogglePressed(el, active, options={}){
  if(!el) return;
  setClassState(el, options.classes || ['active','is-active'], active);
  el.setAttribute(options.attribute || 'aria-pressed', active ? 'true' : 'false');
  if(options.activeText || options.inactiveText) el.textContent=active ? (options.activeText || '') : (options.inactiveText || '');
}
function setTextMap(map){
  Object.entries(map).forEach(([id,value])=>setText(id,value));
}

const RUNE_CHOICE_TARGETS=[['ap','rAP'],['ua','rUA'],['td','rTD'],['harmony','rHarmony']];
const SPEC_BOARD_PIERCE_VALUES=Object.freeze([0,10,15,20,25,30,35,40]);
const SPEC_BOARD_PIERCE_VALUE_SET=new Set(SPEC_BOARD_PIERCE_VALUES.map(String));
function normalizeSpecBoardPierceValue(value){
  const raw=String(value ?? '').replace(/,/g,'').trim();
  return SPEC_BOARD_PIERCE_VALUE_SET.has(raw) ? raw : '0';
}
function specBoardPierceValue(){
  return Number(normalizeSpecBoardPierceValue(vs('specBoardPierce'))) || 0;
}

/* ── 03 · 입력·화면 동기화 ── */
const ADDITIONAL_STAT_FIELDS=Object.freeze([['addAD','ad'],['addAS','as'],['addCD','cd'],['addCRI','cri'],['addAP','ap'],['addTD','td'],['addUA','ua']]);
const ADDITIONAL_RUNE_NUMERIC_FIELDS=Object.freeze(['ad','as','cd','cri','modAD','modAS','modCD','modCRI','specialValue']);
const ADDITIONAL_RUNE_AWAKEN_BONUS=Object.freeze({'없음':0,a:2,b:5,c:9,d:14,e:20,f:30,g:40});
function emptyAdditionalRune(){
  return {registered:false,ad:'',as:'',cd:'',cri:'',modAD:'0',modAS:'0',modCD:'0',modCRI:'0',specialType:'none',specialValue:'',reinf:'0',asc:'없음'};
}
function normalizeAdditionalRuneNumber(value,allowNegative=false){
  const raw=String(value ?? '').replace(/,/g,'').trim();
  const prefix=allowNegative ? (raw.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : '') : '';
  const digits=raw.replace(/\D/g,'');
  if(!digits) return allowNegative ? '0' : '';
  const numeric=Number(prefix+digits);
  const clamped=allowNegative ? Math.max(-10,Math.min(10,numeric)) : numeric;
  return String(clamped);
}
function normalizeAdditionalRune(value){
  const source=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const rune=emptyAdditionalRune();
  rune.registered=source.registered===true;
  ADDITIONAL_RUNE_NUMERIC_FIELDS.forEach(key=>{
    if(key.startsWith('mod') && (source[key]===undefined || source[key]==='')) return;
    rune[key]=normalizeAdditionalRuneNumber(source[key],key.startsWith('mod'));
  });
  rune.specialType=normalizeRuneChoiceType(source.specialType ?? 'none');
  rune.reinf=String(Math.min(15,Math.max(0,Number(normalizeAdditionalRuneNumber(source.reinf))||0)));
  rune.asc=Object.hasOwn(ADDITIONAL_RUNE_AWAKEN_BONUS,source.asc) ? source.asc : '없음';
  return rune;
}
function parseAdditionalRuneSlots(value){
  let parsed=value;
  if(typeof value==='string'){
    try{parsed=JSON.parse(value);}catch{parsed=[];}
  }
  const source=Array.isArray(parsed) ? parsed : [];
  return Array.from({length:10},(_,index)=>normalizeAdditionalRune(source[index]));
}
function normalizeAdditionalRuneSlotsValue(value){
  return JSON.stringify(parseAdditionalRuneSlots(value));
}
function mainAdditionalRune(){
  const rune=emptyAdditionalRune();
  rune.registered=true;
  for(const [field,id] of Object.entries({ad:'rAD',as:'rAS',cd:'rCD',cri:'rCRI',modAD:'rModAD',modAS:'rModAS',modCD:'rModCD',modCRI:'rModCRI'}))
    rune[field]=String(v(id));
  rune.specialType=normalizeRuneChoiceType(vs('runeChoiceType'));
  rune.specialValue=String(v('runeChoiceValue'));
  rune.reinf=String(Math.max(0,Math.min(15,v('rReinf'))));
  rune.asc=Object.hasOwn(ADDITIONAL_RUNE_AWAKEN_BONUS,vs('rAsc'))?vs('rAsc'):'없음';
  return rune;
}
function additionalRuneSlotsWithMain(){
  const slots=parseAdditionalRuneSlots($('additionalRuneSlots')?.value);
  slots[0]=mainAdditionalRune();
  return slots;
}
function additionalRuneAverage(){
  const slots=additionalRuneSlotsWithMain();
  const totals={ad:0,as:0,cd:0,cri:0,ap:0,td:0,ua:0};
  const round=value=>value<0 ? -Math.floor(-value+0.5) : Math.floor(value+0.5);
  slots.forEach(rune=>{
    if(!rune.registered) return;
    const n=key=>Number(rune[key])||0;
    const bonus=Number(rune.reinf)||0;
    const mod=key=>n('mod'+key);
    totals.ad+=round((n('ad')+bonus+mod('AD'))/3)+(ADDITIONAL_RUNE_AWAKEN_BONUS[rune.asc]||0);
    totals.as+=round((n('as')+bonus+mod('AS'))/3);
    totals.cd+=round((n('cd')+Math.max(0,bonus-10)+mod('CD'))/3);
    totals.cri+=round((n('cri')+bonus+mod('CRI'))/3);
    const special=round(n('specialValue')/3);
    if(rune.specialType==='ap') totals.ap+=special;
    if(rune.specialType==='td' || rune.specialType==='harmony') totals.td+=special;
    if(rune.specialType==='ua' || rune.specialType==='harmony') totals.ua+=special;
  });
  return Object.fromEntries(Object.entries(totals).map(([key,total])=>[key,key==='cri'?round(total/10):Number((total/10).toFixed(1))]));
}
function syncAdditionalAverage(){
  const average=additionalRuneAverage();
  ADDITIONAL_STAT_FIELDS.forEach(([id,key])=>{
    const input=$(id);
    if(input) input.value=String(id==='addAD' ? Math.round(average[key]) : average[key]);
  });
}
function syncMainRuneGrade(){
  const type=normalizeRuneChoiceType(vs('runeChoiceType'));
  const value=$('runeChoiceValue');
  if(value) value.disabled=type==='none';
  const grade=runeGradeKey(type,v('rCD'));
  const name=$('runeGradeName');
  if(name){name.dataset.runeGrade=grade;name.textContent=RUNE_GRADE_NAMES[grade];}
}
function additionalRuneCardHtml(rune,index){
  const grade=runeGradeKey(rune.specialType,rune.cd);
  const fieldNames={ad:'공격력',as:'공격속도',cd:'크리 데미지',cri:'크리 확률',modAD:'공격력 개조',modAS:'공격속도 개조',modCD:'크리 데미지 개조',modCRI:'크리 확률 개조',specialValue:'특수 스탯 수치'};
  const readonly=index===0;
  const input=(key,mod=false)=>`<input data-additional-rune-index="${index}" data-additional-rune-field="${key}" type="text" inputmode="${mod?'decimal':'numeric'}" aria-label="룬 ${index+1} ${fieldNames[key]}" value="${escapeHtml(mod && Number(rune[key])===0 ? '' : rune[key])}" ${readonly?'disabled':''}>`;
  const statLine=(label,base,mod)=>`<div class="additional-rune-stat-line"><label>${label}</label>${input(base)}${input(mod,true)}</div>`;
  const option=(value,label,selected)=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`;
  const kinds=[['none','선택 안함'],['ap','마법공격력'],['ua','유닛 가속'],['td','총 데미지'],['harmony','총 데미지 + 유닛 가속']];
  const awakening=['없음','a','b','c','d','e','f','g'];
  return `<article class="additional-rune-card" data-additional-rune-card="${index}" data-rune-grade="${grade}">
    <header class="additional-rune-card-title"><strong>룬 ${index+1}</strong><span data-additional-rune-grade>${RUNE_GRADE_NAMES[grade]}</span><button type="button" class="additional-rune-reset ui-reset-btn" data-additional-rune-reset="${index}" aria-label="룬 ${index+1} 초기화" title="룬 ${index+1} 초기화" ${(readonly || !rune.registered)?'disabled':''}><svg class="ui-command-glyph" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#dpsUiResetGlyph"/></svg></button></header>
    <div class="additional-rune-stat-heading"><span aria-hidden="true"></span><span>기본 스텟</span><span>개조 스텟</span></div>
    ${statLine('공격력','ad','modAD')}
    <div class="additional-rune-stat-line"><select data-additional-rune-index="${index}" data-additional-rune-field="specialType" aria-label="룬 ${index+1} 특수 스탯" ${readonly?'disabled':''}>${kinds.map(([key,label])=>option(key,label,rune.specialType)).join('')}</select><span class="additional-rune-special-value">${input('specialValue')}</span><i aria-hidden="true"></i></div>
    ${statLine('공격속도','as','modAS')}
    ${statLine('크리 데미지','cd','modCD')}
    ${statLine('크리 확률','cri','modCRI')}
    <div class="additional-rune-stat-line additional-rune-bottom-row"><label>룬 강화수</label><select data-additional-rune-index="${index}" data-additional-rune-field="reinf" aria-label="룬 ${index+1} 강화수" ${readonly?'disabled':''}>${(readonly ? [Number(rune.reinf)] : Array.from({length:16},(_,n)=>n)).map(n=>option(String(n),n===0?'선택 안함':String(n),rune.reinf)).join('')}</select><span class="additional-rune-empty" aria-hidden="true"></span></div>
    <div class="additional-rune-stat-line additional-rune-bottom-row"><label>룬 각성</label><select data-additional-rune-index="${index}" data-additional-rune-field="asc" aria-label="룬 ${index+1} 각성" ${readonly?'disabled':''}>${awakening.map(key=>option(key,key==='없음'?'선택 안함':key,rune.asc)).join('')}</select><span class="additional-rune-empty" aria-hidden="true"></span></div>
  </article>`;
}
function renderAdditionalRuneGrid(){
  const grid=$('additionalRuneGrid');
  if(!grid) return;
  const slots=additionalRuneSlotsWithMain();
  grid.innerHTML=slots.map(additionalRuneCardHtml).join('');
  slots.forEach((rune,index)=>syncAdditionalRuneCard(index,rune));
}
function syncAdditionalRuneCard(index,rune){
  const card=qs(`[data-additional-rune-card="${index}"]`);
  if(!card) return;
  const grade=runeGradeKey(rune.specialType,rune.cd);
  card.dataset.runeGrade=grade;
  const label=card.querySelector('[data-additional-rune-grade]');
  if(label) label.textContent=RUNE_GRADE_NAMES[grade];
  const special=card.querySelector('[data-additional-rune-field="specialValue"]');
  if(special) special.disabled=index===0 || rune.specialType==='none';
  card.querySelectorAll('[data-additional-rune-field="specialType"], [data-additional-rune-field="reinf"], [data-additional-rune-field="asc"]').forEach(el=>{el.disabled=index===0;});
  const reset=card.querySelector('[data-additional-rune-reset]');
  if(reset) reset.disabled=index===0 || !rune.registered;
}
function closeAdditionalRuneModal(){
  const modal=$('additionalRuneModal');
  if(pendingConfirmAction?.key==='resetAllAdditionalRunes') clearConfirmAction();
  if(modal) modal.hidden=true;
  DPS_BODY.classList.remove('additional-rune-open');
  $('additionalRuneOpen')?.focus();
}
function openAdditionalRuneModal(){
  renderAdditionalRuneGrid();
  const modal=$('additionalRuneModal');
  if(modal) modal.hidden=false;
  DPS_BODY.classList.add('additional-rune-open');
  modal?.querySelector('[data-additional-close]')?.focus();
}
function bindAdditionalRuneEvents(){
  DPS_BODY.addEventListener('click',event=>{
    if(event.target.closest?.('#additionalRuneOpen')){openAdditionalRuneModal();return;}
    if(event.target.closest?.('[data-additional-close]')){closeAdditionalRuneModal();return;}
    const resetAll=event.target.closest?.('[data-additional-reset-all]');
    if(resetAll){
      if(resetAll.disabled || isStorageLocked()) return;
      requestConfirmAction('resetAllAdditionalRunes','한 번 더 누르면 메인 룬 포함 10칸 전체 초기화',()=>{
        if(isStorageLocked()) return;
        for(const id of ['rAD','rAS','rCD','rCRI','rModAD','rModAS','rModCD','rModCRI','runeChoiceValue','rReinf']) setValue(id,0);
        setValue('runeChoiceType','none');
        setValue('rAsc','없음');
        $('additionalRuneSlots').value=JSON.stringify(parseAdditionalRuneSlots([]));
        syncRuneChoice();
        renderAdditionalRuneGrid();
        commitAppUpdate({recalculate:'now'});
      },resetAll);
      return;
    }
    const reset=event.target.closest?.('[data-additional-rune-reset]');
    if(reset){
      const index=Number(reset.dataset.additionalRuneReset);
      if(reset.disabled || isStorageLocked() || !Number.isInteger(index) || index<1 || index>=10) return;
      const slots=parseAdditionalRuneSlots($('additionalRuneSlots')?.value);
      slots[index]=emptyAdditionalRune();
      $('additionalRuneSlots').value=JSON.stringify(slots);
      renderAdditionalRuneGrid();
      commitAppUpdate();
    }
  });
  const handleRuneChange=event=>{
    const field=event.target?.dataset?.additionalRuneField;
    const index=Number(event.target?.dataset?.additionalRuneIndex);
    if(!field || !Number.isInteger(index) || index<1 || index>=10 || event.target.disabled || isStorageLocked()) return;
    if(event.type==='input' && event.isComposing) return;
    const slots=parseAdditionalRuneSlots($('additionalRuneSlots')?.value);
    const rune=slots[index];
    const numeric=ADDITIONAL_RUNE_NUMERIC_FIELDS.includes(field);
    const isMod=field.startsWith('mod');
    const raw=event.target.value;
    const value=numeric ? normalizeAdditionalRuneNumber(raw,isMod) : raw;
    const typingSign=isMod && event.type==='input' && (raw==='-' || raw==='+');
    const visible=isMod && value==='0' ? '' : value;
    if(numeric && !typingSign && raw!==visible) event.target.value=visible;
    if(isMod && value==='0' && !rune.registered) return;
    if(rune[field]===value && rune.registered) return;
    rune[field]=value;
    rune.registered=true;
    $('additionalRuneSlots').value=JSON.stringify(slots);
    syncAdditionalRuneCard(index,rune);
    commitAppUpdate();
  };
  $('additionalRuneGrid')?.addEventListener('input',handleRuneChange);
  $('additionalRuneGrid')?.addEventListener('change',handleRuneChange);
}
function syncRuneChoice(){
  const type=normalizeRuneChoiceType(vs('runeChoiceType'));
  const value=v('runeChoiceValue');
  RUNE_CHOICE_TARGETS.forEach(([kind,id])=>setValue(id, kind===type ? value : 0));
  syncMainRuneGrade();
}
function hydrateRuneChoiceFromHidden(){
  const typeEl=$('runeChoiceType');
  const valueEl=$('runeChoiceValue');
  if(!typeEl || !valueEl) return;
  const selected=RUNE_CHOICE_TARGETS.find(([,id])=>v(id)!==0);
  typeEl.value=selected ? selected[0] : 'none';
  valueEl.value=String(selected ? v(selected[1]) : 0);
  syncRuneChoice();
}
function setSelectButton(id,value){
  const el=$(id);
  if(!el) return;
  if(['aprRunePlus','sepRunePlus'].includes(id) && Number(value)>v(id.replace('Plus','Normal'))) return;
  el.value=value;
  syncSelectButtons();
  commitAppUpdate();
}
function syncSelectButtons(){
  const runePlusLimits={};
  ['aprRune','sepRune'].forEach(prefix=>{
    const normal=$(prefix+'Normal');
    const plus=$(prefix+'Plus');
    if(!normal || !plus) return;
    const limit=Math.max(0,Math.min(6,Number(normal.value)||0));
    runePlusLimits[plus.id]=limit;
    if(Number(plus.value)>limit) plus.value=String(limit);
    [...plus.options].forEach(option=>{
      const disabled=Number(option.value)>limit;
      if(option.disabled!==disabled) option.disabled=disabled;
    });
  });
  qsa('.seg-btns[data-target]').forEach(group=>{
    const id=group.dataset.target;
    const val=$(id)?.value;
    group.querySelectorAll('button[data-value]').forEach(btn=>{
      if(Object.hasOwn(runePlusLimits,id)) btn.disabled=Number(btn.dataset.value)>runePlusLimits[id];
      setClassState(btn, 'active', btn.dataset.value===val);
    });
  });
}
function syncBuffChoiceButtons(){
  qsa('.buff-choice-item').forEach(item=>{
    const input=item.querySelector('input[type="checkbox"]');
    setTogglePressed(item, !!input?.checked, {classes:'is-active'});
  });
}
function syncDonationBuffControl(){
  const select=$('donationBuffType');
  if(!select) return;
  const value=activeDonationBuffType();
  if(select.value!==value) select.value=value;
  qsa('.donation-buff-grid button[data-value]').forEach(button=>{
    const selected=button.dataset.value===value;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',selected ? 'true' : 'false');
  });
}
function setDonationBuffType(value){
  const select=$('donationBuffType');
  if(!select) return false;
  const normalized=normalizeDonationBuffType(value);
  INV[116]=donationInvestmentFromType(normalized);
  select.value=normalized;
  syncDonationBuffControl();
  syncSelectButtons();
  commitAppUpdate();
  return true;
}
const originalDifficultyOptions=[];
const lastValidDifficultyByMode=new Map();
function syncDifficultyOptions({restoreAll=false}={}){
  const el=$('diff');
  if(!el) return;
  if(!originalDifficultyOptions.length){
    originalDifficultyOptions.push(...[...el.options].map(option=>({value:option.value,label:option.textContent})));
  }
  const monthlyPlanetDifficulty=currentPlanetExplorationDifficulty();
  const planetOption=originalDifficultyOptions.find(option=>isPlanetExplorationDifficulty(option.value));
  if(planetOption) planetOption.value=monthlyPlanetDifficulty;
  const coop=isCoopMode();
  const artifact=!restoreAll && isArtifactDpsViewEnabled();
  const key=`${coop?'coop':'solo'}:${artifact?'artifact':'normal'}`;
  const options=originalDifficultyOptions.filter(option=>restoreAll ||
    (!coop || isCoopAllowedDifficulty(option.value)) &&
    (!artifact || !artifactDpsUnavailableDifficulty(option.value)));
  const current=isPlanetExplorationDifficulty(el.value) ? monthlyPlanetDifficulty : el.value;
  syncSelectOptionsBySignature(el,`${restoreAll?'all':key}:${monthlyPlanetDifficulty}`,options,'difficultyOptionSignature');
  const allowed=new Set(options.map(option=>option.value));
  const next=allowed.has(current) ? current :
    (allowed.has(lastValidDifficultyByMode.get(key)) ? lastValidDifficultyByMode.get(key) : 'Hall Of Fame');
  el.value=next;
  if(!restoreAll) lastValidDifficultyByMode.set(key,next);
}
function penanceOptionLabel(value){return value>0 ? `${value} 고행` : '선택 안함';}
function syncPenanceOptions(){
  const el=$('penance');
  if(!el) return;
  const diff=vs('diff');
  const ignored=shouldIgnorePenanceForDifficulty(diff);
  const max=ignored ? 0 : diff==='Abyss road' ? DPS_CONFIG.dpsTable.abyssRoadPenanceMax : currentPenanceMax();
  const current=normalizePenanceValue(el.value || el.dataset.penanceValue || '0', max);
  syncSelectOptionsBySignature(
    el,
    String(max),
    Array.from({length:max+1}, (_,value)=>({value,label:penanceOptionLabel(value)})),
    'penanceMax'
  );
  el.value=current;
  el.dataset.penanceValue=current;
  el.disabled=ignored;
}
function powerBlessOptionLabel(value){return Number(value)>0 ? String(value) : '선택 안함';}
function syncPowerBlessOptions(){
  const el=$('pbless');
  if(!el) return;
  const current=normalizePowerBlessRawValue(el.value);
  syncSelectOptionsBySignature(
    el,
    `pbless:${POWER_BLESS_ALL_OPTIONS.join(',')}`,
    POWER_BLESS_ALL_OPTIONS.map(value=>({value,label:powerBlessOptionLabel(value)}))
  );
  el.value=current;
}
function syncModeChoiceButtons(){
  const coop=normalizeOnOffValue($('coopMode')?.value,'OFF')==='ON';
  const bank=normalizeSpBankApplyValue($('spBankApply')?.value);
  qsa('[data-mode-choice]').forEach(button=>{
    const group=button.dataset.modeChoice;
    const selected=group==='battle' ? button.dataset.value===(coop?'coop':'solo') : button.dataset.value===bank;
    button.setAttribute('aria-pressed',selected ? 'true' : 'false');
    button.classList.toggle('is-selected',selected);
  });
}
function syncBattleMode(sourceId='', options={}){
  const solo=$('soloMode'), coop=$('coopMode');
  if(!solo || !coop) return;
  const normalizedCoop=normalizeOnOffValue(coop.value,'OFF');
  syncSelectOptionsBySignature(coop, 'coop-mode-toggle', [{value:'OFF',label:'OFF'},{value:'ON',label:'ON'}]);
  coop.value=normalizedCoop;
  const sourceValue=sourceId==='soloMode' ? normalizeOnOffValue(solo.value,'ON') : normalizeOnOffValue(coop.value,'OFF');
  const coopOn=sourceId==='soloMode' ? sourceValue!=='ON' : sourceValue==='ON';
  solo.value=coopOn ? 'OFF' : 'ON';
  coop.value=coopOn ? 'ON' : 'OFF';
  syncDifficultyOptions();
  syncPenanceOptions();
  syncTeamSelect({restorePersonal: !!sourceId && !coopOn, preserveCurrent: !sourceId, defaultCoop: !!options.defaultCoop && coopOn});
  syncModeChoiceButtons();
}
function syncTeamButtons(){
  const selected=vs('team');
  const available=new Set([...($('team')?.options || [])].map(option=>option.value));
  qsa('[data-team-count]').forEach(button=>{
    const active=button.dataset.teamCount===selected;
    button.disabled=!available.has(button.dataset.teamCount);
    button.classList.toggle('is-selected',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
function syncTeamSelect(options={}){
  const el=$('team');
  if(!el) return;
  const row=el.closest?.('[data-basic-row="team"]');
  const coopActive=isCoopActive();
  const locked=!coopActive && SOLO_START_LOCK_DIFFICULTIES.has(difficultyName());
  const current=normalizeTeamCountValue(el.value);
  const optionValues=coopActive ? [2,3] : locked ? [1] : [1,2,3];
  if(locked && current!=='1') el.dataset.personalTeamValue=current;
  syncSelectOptionsBySignature(
    el,
    `team:${coopActive?'coop':locked?'locked':'solo'}:${optionValues.join(',')}`,
    optionValues.map(value=>({value,label:String(value)})),
    'teamOptionSignature'
  );
  el.disabled=false;
  row?.classList.toggle('is-locked',locked);
  if(coopActive){
    const source=options.defaultCoop ? '3' : ((current==='2' || current==='3') ? current : (el.dataset.coopTeamValue || '3'));
    const value=normalizeTeamCountValue(source,3)==='1' ? '3' : normalizeTeamCountValue(source,3);
    el.value=value;
    el.dataset.coopTeamValue=value;
  }else{
    const restorePersonal=options.restorePersonal || (current==='1' && !!el.dataset.personalTeamValue && options.preserveCurrent!==true);
    const source=locked ? '1' : restorePersonal ? (el.dataset.personalTeamValue || current) : current;
    const value=normalizeTeamCountValue(source,1);
    el.value=value;
    if(!locked) el.dataset.personalTeamValue=value;
  }
  syncTeamButtons();
}
function clampEnchantInput(el){
  let n=parseInt(String(el.value||'0').replace(/[^0-9]/g,''),10);
  if(!Number.isFinite(n)) n=0;
  n=Math.max(0,Math.min(9,n));
  el.value=String(n);
  return n;
}
function syncEnchantInputs(){
  const code=ENCHANT_INPUT_IDS.map(id=>{
    const el=$(id);
    return el ? clampEnchantInput(el) : 0;
  }).join('');
  const hidden=$('enchantCode');
  if(hidden) hidden.value=code;
}
function syncEnchantCodeFromInputs(updateInputs=true){
  const hidden=$('enchantCode');
  const hasInputs=ENCHANT_INPUT_IDS.some(id=>$(id));
  if(!hasInputs) return;
  if(updateInputs && hidden){
    const code=String(hidden.value||'999999').padEnd(6,'0');
    ENCHANT_INPUT_IDS.forEach((id,i)=>{
      const el=$(id);
      if(el) el.value=String(Math.max(0,Math.min(9,parseInt(code[i]||'0',10)||0)));
    });
  }
  syncEnchantInputs();
}
function formatMoneyInput(el){
  if(!el) return;
  if(typeof SHARD_VALUE_IDS!=='undefined' && SHARD_VALUE_IDS.has(el.id)){
    const normalized=normalizeShardStorageValue(el.value);
    el.value=normalized.replace(/\B(?=(\d{3})+(?!\d))/g,',');
    return;
  }
  const raw=String(el.value||'').replace(/[^\d-]/g,'');
  if(raw===''||raw==='-'){el.value=raw;return;}
  const neg=raw[0]==='-';
  const digits=(neg?raw.slice(1):raw).replace(/^0+(?=\d)/,'');
  el.value=(neg?'-':'') + (digits?digits.replace(/\B(?=(\d{3})+(?!\d))/g,','):'0');
}
function formatAllMoneyInputs(){
  qsa('.money-input').forEach(formatMoneyInput);
}

function currentArtifactDpsResult(){
  const diff=vs('diff');
  const battleMode=isCoopMode() ? 'coop' : 'solo';
  if(isTowerDifficulty()){
    return calculateArtifactDpsPreview(TOWER_DIFFICULTY_NAME, 0, challengeTowerFloorStoredValue(), {battleMode:'solo'});
  }
  return calculateArtifactDpsPreview(diff, v('penance'), targetRoundStoredValue(), {battleMode});
}
function renderDpsSummary(s){
  updateDpsContextSummary();
  syncDpsBaseUnitControl();
  const artifactView=isArtifactDpsViewEnabled();
  setText('dpsMainLabel', artifactView ? '유물 DPS' : '스펙 DPS');
  if(shouldHideDpsForRound()){
    setText('dpsVal', '—');
    renderDpsBaseUnitSummary(s,true);
    return;
  }
  const artifactResult=artifactView ? currentArtifactDpsResult() : null;
  const displayDps=artifactView ? artifactResult.dps : s.M19;
  setText('dpsVal', Number.isFinite(displayDps) ? displayDps.toFixed(2) : '—');
  renderDpsBaseUnitSummary(s,false);
}
const STAT_COMPARE_ROWS=[
  ['AD', s=>fmt(s.displayAD,0), s=>fmt(s.M4,0)],
  ['APS', s=>fmt(s.displayAPS,0), s=>fmt(s.displayAPS,0)],
  ['APU', s=>fmt(s.displayAPU,0), s=>fmt(s.actualAPU ?? s.displayAPU,0)],
  ['AS', s=>fmt(s.M7,1), s=>fmt(s.M7,1)],
  ['CRI', s=>fmt(s.M8,1), s=>fmt(s.M8,1)],
  ['CD', s=>fmt(s.displayCD,1), s=>fmt(s.actualCD,2)],
  ['MC', s=>fmt(s.M10,0), s=>fmt(s.M10,0)],
  ['TD', s=>fmt(s.rawTD,1), s=>fmt(s.M11,2)],
  ['DR', s=>fmt(s.M12,0), s=>fmt(s.actualM12,0)],
  ['DR2P', ()=>fmt(coopPassengerDefenseReduceValue('coopPassenger2Dr'),0), ()=>fmt(coopPassengerDefenseReduceValue('coopPassenger2Dr'),0)],
  ['DR3P', ()=>fmt(coopPassengerDefenseReduceValue('coopPassenger3Dr'),0), ()=>fmt(coopPassengerDefenseReduceValue('coopPassenger3Dr'),0)],
  ['PIERCE', s=>`${fmt(s.effectivePierce,0)}%`, s=>`${fmt(s.effectivePierce,0)}%`],
  ['UA', s=>fmt(s.displayUA,4), s=>fmt(s.M13,4)],
  ['SR', s=>fmt(s.displaySR,2), s=>fmt(s.actualSR ?? s.displaySR,2)],
  ['HR', s=>fmt(s.displayHR,2), s=>fmt(s.actualHR ?? s.displayHR,2)],
  ['MD', s=>fmt(s.M16,0), s=>fmt(s.M16,0)],
  ['MP', s=>fmt(s.M17,0), s=>fmt(s.M17,0)],
  ['MCP', s=>fmt(s.M18,0), s=>fmt(s.M18,0)]
];
function dpsBoardContextHtml(){
  const context=getDpsContextValues();
  const difficulty=isPlanetExplorationDifficulty() ? planetExplorationDisplayName() : selectedControlText($('diff'));
  return `<span class="spec-board-mode">${escapeHtml(context.modePrimary)}</span><span class="spec-board-difficulty">${escapeHtml(difficulty)}</span>`;
}
function renderRightHeroContext(){
  const target=$('rightHeroCompactContext');
  if(target) setHTMLIfChanged(target,dpsBoardContextHtml());
  const tower=isTowerDifficulty();
  const planet=isPlanetExplorationDifficulty();
  setText('specHeroStageLabel',tower||planet?'현재 층':'현재 고행 / 라운드');
  setText('specHeroStage',tower?`${challengeTowerFloorStoredValue()}층`:planet?`${planetExplorationFloorStoredValue()}층`:`${effectivePenanceValue()} 고행`);
  setText('specHeroRound',tower||planet?'':`${normalizedRoundNumber(targetRoundStoredValue())} 라운드`);
}
function renderStatSummary(s){
  renderRightHeroContext();
  const artifactView=isArtifactDpsViewEnabled();
  const coopActive=isCoopActive();
  const teamCount=typeof effectiveTeamCount==='function' ? effectiveTeamCount() : Math.max(1, Math.min(3, Number(v('team')) || 1));
  qsa('[data-coop-stat-row]').forEach(row=>{
    const player=Number(row.dataset.coopStatRow)||0;
    row.hidden=!coopActive || player>teamCount;
  });
  STAT_COMPARE_ROWS.forEach(([key,display,actual])=>{
    const displayText=artifactView && key==='PIERCE' ? '0%' : display(s);
    const actualText=artifactView && key==='PIERCE' ? '0%' : actual(s);
    setText('s'+key+'Display', displayText);
    setText('s'+key+'Actual', actualText);
  });
}
function renderResourceSummary(s){
  const totalSp=s.effectiveSP ?? effectiveSP();
  const usedSp=s.spUsedTotal ?? ((s.spO||0)+(s.spU||0));
  const spRemain=totalSp-usedSp;
  const epOwned=v('ep');
  const epRemain=epOwned-s.epU;
  const rpRemain=v('rp')-s.rpU;
  const soulRemain=v('soul')-s.soulU;
  setTextMap({
    spTotalBasicView:fullNumber(totalSp),
    spAttackView:fullNumber(s.spO), spUtilityView:fullNumber(s.spU), spRemainBasicView:fullNumber(spRemain),
    epUsedBasicView:fullNumber(s.epU), epRemainBasicView:fullNumber(epRemain),
    rpUsedBasicView:fullNumber(s.rpU), rpRemainBasicView:fullNumber(rpRemain),
    soulUsedBasicView:fullNumber(s.soulU), soulRemainBasicView:fullNumber(soulRemain)
  });
  syncSpBankDisplay();
}
function syncControlDisplays(){
  [syncSelectButtons,syncDonationBuffControl,syncBuffChoiceButtons,syncBattleMode,syncSpBankApplyControl,syncDifficultyTargetControls,syncErosionControlElements,syncPowerBlessOptions,syncSpecDpsSpeedSwitch,normalizeAllDpsBaseUnitQuantityInputs,formatAllMoneyInputs].forEach(fn=>fn());
}
function syncSpBankApplyControl(){
  const select=$('spBankApply');
  if(!select) return false;
  const state=normalizeSpBankApplyValue(select.value);
  if(select.value!==state) select.value=state;
  syncModeChoiceButtons();
  return true;
}
function syncPreCalculationViews(){
  normalizeRoundInputs();
  syncExclusiveRuneOptions();
  syncRuneChoice();
  syncAdditionalAverage();
  if(!$('additionalRuneModal')?.hidden){
    const rune=mainAdditionalRune();
    const card=qs('[data-additional-rune-card="0"]');
    if(card){
      for(const key of ADDITIONAL_RUNE_NUMERIC_FIELDS){
        const input=card.querySelector(`[data-additional-rune-field="${key}"]`);
        const visible=key.startsWith('mod') && Number(rune[key])===0 ? '' : rune[key];
        if(input && input.value!==visible) input.value=visible;
      }
      for(const key of ['specialType','reinf','asc']){
        const select=card.querySelector(`[data-additional-rune-field="${key}"]`);
        if(select && select.value!==rune[key]) select.value=rune[key];
      }
      syncAdditionalRuneCard(0,rune);
    }
  }
  syncDonationBuffControl();
  syncEnchantInputs();
  syncControlDisplays();
  syncTraitLimitInputs();
  renderEnchantPreview();
  renderXpCut();
}
function renderCalculatedViews(s){
  renderSkillDamage(s);
  renderDpsSummary(s);
  renderStatSummary(s);
  syncSpecDpsSpeedSwitch();
  syncArtifactDpsViewSwitch();
  syncPlanetExplorationRestrictedControls();
  renderEnhanceSummary(s.enhanceStats);
  renderResourceSummary(s);
  updateTraits();
}
/* 특성 투자 제한: 원본 ON/OFF 셀렉트와 좌우 선택 버튼 동기화 */
const TRAIT_LIMIT_STATUS_FIELDS=['traitLimitAS','traitLimitCRI','traitLimitLifeBonus','traitLimitMagicAP','traitLimitMultiTarget','traitLimitInfinite'];
function syncTraitLimitControlPresentation(){
  for(const id of ['traitLimitLifeBonus','traitLimitMagicAP','traitLimitMultiTarget','traitLimitInfinite']){
    const field=$(id);
    if(!field) continue;
    DPS_BODY.querySelectorAll(`[data-limit-select="${id}"]`).forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.limitValue===field.value));
    });
  }
}
function bindTraitLimitChoiceEvents(){
  DPS_BODY.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-limit-select][data-limit-value]');
    if(!button || button.disabled) return;
    const field=$(button.dataset.limitSelect);
    if(!field || field.value===button.dataset.limitValue) return;
    field.value=button.dataset.limitValue;
    syncTraitLimitControlPresentation();
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
  ['input','change'].forEach(type=>{
    DPS_BODY.addEventListener(type,event=>{
      if(TRAIT_LIMIT_STATUS_FIELDS.includes(event.target?.id)) syncTraitLimitControlPresentation();
    },true);
  });
}
/* ── 04 · 계산 실행·예약 ── */
let appCalculationRevision=0;
let appUpdateTimer=0;
let pendingAppUpdateSave=false;
function invalidateAppCalculations(){
  appCalculationRevision++;
}
function recalc(options={}){
  try{
    syncPreCalculationViews();
    syncTraitLimitControlPresentation();
    withArtifactDpsViewBuffApplied(()=>{
      const stats=computeStatsRaw();
      invalidateAppCalculations();
      renderCalculatedViews(stats);
    });
    if(options.save!==false) saveState({silent:true});
  }catch(e){
    rememberAppIssue('error','recalc',e);
    try{updateTraits();}catch(traitError){rememberAppIssue('error','특성 표시',traitError);}
    return false;
  }
  return true;
}
function requestAppUpdate(options={}){
  invalidateAppCalculations();
  pendingAppUpdateSave = pendingAppUpdateSave || options.save!==false;
  if(appUpdateTimer) clearTimeout(appUpdateTimer);
  appUpdateTimer=setTimeout(()=>{
    const save=pendingAppUpdateSave;
    appUpdateTimer=0;
    pendingAppUpdateSave=false;
    recalc({save});
  }, DPS_CONFIG.ui.updateDelay);
}
function commitAppUpdate(options={}){
  const recalculate=options.recalculate ?? 'defer';
  const save=options.save!==false && !dpsUnitSlotDraft;
  const saveNow=options.saveNow===true;
  if(recalculate==='now'){
    if(appUpdateTimer) clearTimeout(appUpdateTimer);
    appUpdateTimer=0;
    pendingAppUpdateSave=false;
    recalc({save:save && saveNow});
  }else if(recalculate!==false) requestAppUpdate({save:save && saveNow});
  if(save) scheduleAutoSave();
}
function renderEnhanceSummary(stats=null){
  const e=stats || unitEnhanceStats();
  const unitLimit=dpsBaseUnitQuantityLimit();
  const sepPlusUniqueAd=SYSTEM_COMMON_BUFFS.uniqueUnit.baseAd + septemberPlusUniqueAdBonus(e.septemberPlus);
  setTextMap({
    enhanceChanceView:(e.chance*100).toFixed(2)+'%',
    enhanceCountView:`${fmt(e.count,0)}회`,
    enhanceValueView:fmt(e.value,0),
    sepRuneQuantityView:fmt(unitLimit,0),
    sepRuneAttackView:`+${fmt(sepPlusUniqueAd,0)}`
  });
}
const ENCHANT_PREVIEW_FIELDS=Object.freeze([
  ['ad','enchOutAD'],['cri','enchOutCRI'],['ua','enchOutUA'],
  ['td','enchOutTD'],['sr','enchOutSR'],['hr','enchOutHR']
]);
function renderEnchantPreview(){
  const enchantStats=currentEnchantStats();
  ENCHANT_PREVIEW_FIELDS.forEach(([key,outId],i)=>{
    const e=enchantStats[i];
    const val=key==='ua'
      ? e[key].toFixed(2)+'×'
      : fmt(e[key], ['ad','cri','td'].includes(key)?0:2);
    const out=$(outId);
    if(out) out.textContent=val;
  });
}

function renderXpCut(){
  const base=xpCutCoopBase(v('sp'));
  const target=$('xpCutRows');
  if(!target) return;
  setHTMLIfChanged(target,XP_CUT_DIVISOR_GROUPS.map(group=>{
    const rows=group.rows.map(row=>{
      const value=big(base/row.divisor);
      return `<div class="bus-cut-row"><span class="bus-cut-stage">${row.stage}·${row.divisor}배</span><span class="bus-cut-value">${value}</span></div>`;
    }).join('');
    return `<div class="bus-cut-group"><span class="bus-cut-mode">${group.label}</span><div class="bus-cut-group-rows">${rows}</div></div>`;
  }).join(''));
}

function planetExplorationRestrictionsActive(){
  return typeof isPlanetExplorationDifficulty==='function' && isPlanetExplorationDifficulty();
}
function artifactDpsUnavailableDifficulty(diff=vs('diff')){
  return diff==='Abyss road' || diff==='Deep Abyss' || isPlanetExplorationDifficulty(diff);
}
function isArtifactDpsViewEnabled(){
  const toggle=$('artifactDpsViewToggle');
  return !artifactDpsUnavailableDifficulty() && toggle?.getAttribute('aria-checked')==='true';
}
function setArtifactDpsViewEnabled(enabled){
  const toggle=$('artifactDpsViewToggle');
  if(!toggle) return;
  toggle.setAttribute('aria-checked',enabled && !artifactDpsUnavailableDifficulty() ? 'true' : 'false');
  syncArtifactDpsViewSwitch();
  syncDifficultyOptions();
}
function syncArtifactDpsViewSwitch(){
  const toggle=$('artifactDpsViewToggle');
  if(!toggle) return;
  const disabled=artifactDpsUnavailableDifficulty();
  if(disabled) toggle.setAttribute('aria-checked','false');
  const active=isArtifactDpsViewEnabled();
  const dpsTableTitle=active ? '유물 DPS표' : 'DPS표';
  setText('dpsCompareOpen',dpsTableTitle);
  setText('dpsCompareModalLabel',dpsTableTitle);
  setText('traitOptimizeScopeTitle',active ? '유물 최적화' : '특성 최적화');
  const optimizeButton=DPS_BODY.querySelector('[data-action="optimizeSP"]');
  if(optimizeButton) optimizeButton.setAttribute('aria-label',active ? '유물 최적화 실행' : '특성 최적화 실행');
  syncOnOffSwitch(toggle,{
    active,disabled,label:'유물 DPS',disabledLabel:'유물 DPS 사용 불가',
    containerSelector:'.artifact-dps-switch-wrap'
  });
}
function syncOnOffSwitch(toggle,{active=false,disabled=false,label='설정',disabledLabel='',containerSelector=''}){
  if(!toggle) return;
  toggle.disabled=disabled;
  toggle.classList.toggle('is-active',active);
  toggle.setAttribute('aria-checked',active ? 'true' : 'false');
  toggle.setAttribute('aria-disabled',disabled ? 'true' : 'false');
  toggle.setAttribute('aria-label',disabled && disabledLabel ? disabledLabel : `${label} ${active ? '켬' : '끔'}`);
  if(containerSelector) toggle.closest(containerSelector)?.classList.toggle('is-disabled',disabled);
}
const UNIFIED_DPS_SPEED_MODE_INPUT_IDS=Object.freeze(['specDpsSpeedMode','dpsBaseUnitSpeedMode']);
function setUnifiedDpsSpeedModeValue(enabled){
  const disabled=!speedModeSupported();
  const active=!disabled && !!enabled;
  UNIFIED_DPS_SPEED_MODE_INPUT_IDS.forEach(id=>{
    const input=$(id);
    if(input) input.value=active ? 'ON' : 'OFF';
  });
  return {active,disabled};
}
function normalizeUnifiedDpsSpeedModeValue(){
  const active=UNIFIED_DPS_SPEED_MODE_INPUT_IDS.some(id=>storedSpeedModeEnabled(id));
  return setUnifiedDpsSpeedModeValue(active);
}
function syncSpecDpsSpeedSwitch(){
  const toggles=qsa('[data-spec-dps-speed-toggle]');
  if(!toggles.length) return;
  const {active,disabled}=normalizeUnifiedDpsSpeedModeValue();
  toggles.forEach(toggle=>syncOnOffSwitch(toggle,{active,disabled,label:'스피드 모드',containerSelector:'.spec-dps-speed-switch-wrap'}));
}
function syncPlanetExplorationRestrictedControls(){
  const disabled=planetExplorationRestrictionsActive();
  const artifact=$('prodArtifact');
  if(artifact){
    if(disabled) artifact.checked=false;
    artifact.disabled=disabled;
    artifact.closest('.buff-choice-item')?.classList.toggle('is-disabled',disabled);
  }
  syncBuffChoiceButtons();
  if(disabled) setArtifactDpsViewEnabled(false);
}
function applyUnifiedDpsSpeedModeToggle(active){
  setUnifiedDpsSpeedModeValue(!active);
  syncSpecDpsSpeedSwitch();
  commitAppUpdate();
  return true;
}
function toggleSpecDpsSpeedMode(){
  const toggle=$('specDpsSpeedModeToggle');
  const {active,disabled}=normalizeUnifiedDpsSpeedModeValue();
  if(toggle?.disabled || disabled) return false;
  return applyUnifiedDpsSpeedModeToggle(active);
}
function withArtifactDpsViewBuffApplied(callback){
  const artifactEl=$('prodArtifact');
  if(!artifactEl || !isArtifactDpsViewEnabled()) return callback();
  const checked=artifactEl.checked;
  artifactEl.checked=true;
  try{
    return callback();
  }finally{
    artifactEl.checked=checked;
  }
}
function renderSkillDamage(s){
  const ap=s?.displayAPU ?? 535;
  const rows=calculateSkillDamageRows({ap,doubleSpace:v('skillDouble'),round:v('skillRound'),mode:vs('skillMode')});
  const apView=$('skillAPView');
  if(apView) apView.textContent=fmt(ap,0);
  const pv=$('skillPenaltyView');
  if(pv) pv.textContent=`${(rows.penalty*100).toFixed(1)}%`;
  const el=$('skillRows');
  if(!el) return;
  setHTMLIfChanged(el,rows.items.map(row=>`<tr><td>${row.name}</td><td>${fmt(row.total,1)}%</td><td>AP ${fmt(ap,0)} / 더블 ${fmt(rows.doubleSpace,2)}</td></tr>`).join(''));
}
/* ── 05 · DPS표 및 미리보기 ── */
const DPS_TABLE_DIFFICULTIES=DPS_CONFIG.dpsTable.difficulties;
const COOP_DPS_TABLE_DIFFICULTIES=DPS_TABLE_DIFFICULTIES.slice(0, DPS_TABLE_DIFFICULTIES.indexOf('Hall Of Fame') + 1);
const COOP_DPS_TABLE_PENANCE_MIN=0;
const COOP_DPS_TABLE_PENANCE_MAX=COOP_PENANCE_MAX;
const DPS_TABLE_PENANCE_MIN=Math.max(0,DPS_CONFIG.dpsTable.penanceMin ?? 0);
const DPS_TABLE_PENANCE_MAX=DPS_CONFIG.dpsTable.penanceMax ?? 20;
let dpsPreviewCacheRevision=-1;
const dpsPreviewValueCache=new Map();
const dpsPreviewCoreCache=new Map();
function dpsTablePreviewCore(diff,round,options,artifactView){
  const cacheKey=JSON.stringify([artifactView,diff,round,options.battleMode||'',options.teamCount||'']);
  if(dpsPreviewCoreCache.has(cacheKey)) return dpsPreviewCoreCache.get(cacheKey);
  try{
    const core=calculateDpsPreviewCore(diff,round,options,artifactView);
    dpsPreviewCoreCache.set(cacheKey,core);
    return core;
  }catch(e){
    rememberAppIssue('error','[DPS preview core failed]',e);
    return null;
  }
}
function dpsTablePreviewValue(diff, penance, round, options={}){
  if(dpsPreviewCacheRevision!==appCalculationRevision){
    dpsPreviewValueCache.clear();
    dpsPreviewCoreCache.clear();
    dpsPreviewCacheRevision=appCalculationRevision;
  }
  const artifactView=isArtifactDpsViewEnabled();
  const cacheKey=JSON.stringify([artifactView,diff,penance,round,options.battleMode||'',options.teamCount||'']);
  if(dpsPreviewValueCache.has(cacheKey)) return dpsPreviewValueCache.get(cacheKey);
  const previewOptions={...options,previewCore:dpsTablePreviewCore(diff,round,options,artifactView)};
  const value=artifactView
    ? calculateArtifactDpsPreview(diff, penance, round, previewOptions).dps
    : computeDpsPreview(diff, penance, round, previewOptions);
  dpsPreviewValueCache.set(cacheKey,value);
  return value;
}
function selectedDpsTableTeamCount(coop=false){
  const teamCount=Number(normalizeTeamCountValue(vs('team'),coop?2:1));
  return coop ? Math.max(2,teamCount) : teamCount;
}
// 분석 보드 DPS표: 기존 입력값과 DPS 미리보기 캐시를 그대로 활용합니다.
let activeDpsCompareMode='solo';
function formatDpsCompareValue(value){
  if(!Number.isFinite(value)) return '—';
  const displayed=value.toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1});
  return Number(displayed.replace(/,/g,''))<=0 ? '-' : displayed;
}
function dpsCompareMatrixHtml(coop){
  const round=normalizedRoundNumber(targetRoundStoredValue());
  const teamCount=selectedDpsTableTeamCount(coop);
  const difficulties=(coop?COOP_DPS_TABLE_DIFFICULTIES:DPS_TABLE_DIFFICULTIES).filter(diff=>!isArtifactDpsViewEnabled() || !artifactDpsUnavailableDifficulty(diff));
  const min=coop?COOP_DPS_TABLE_PENANCE_MIN:DPS_TABLE_PENANCE_MIN;
  const max=coop?COOP_DPS_TABLE_PENANCE_MAX:DPS_TABLE_PENANCE_MAX;
  const currentDiff=vs('diff');
  const currentPenance=Number(penanceStoredValue());
  const head=difficulties.map(diff=>`<th scope="col"${diff===currentDiff?' class="is-current"':''}>${escapeHtml(diff)}</th>`).join('');
  const rows=Array.from({length:max-min+1},(_,index)=>{
    const pen=min+index;
    const values=difficulties.map(diff=>{
      const unavailable=(diff==='Deep Abyss' && pen>0) ||
        (diff==='Abyss road' && pen>DPS_CONFIG.dpsTable.abyssRoadPenanceMax);
      const displayed=unavailable ? '-' : formatDpsCompareValue(dpsTablePreviewValue(diff,pen,round,{battleMode:coop?'coop':'solo',teamCount}));
      const current=diff===currentDiff && pen===currentPenance;
      const classes=[current?'is-current':'',diff===currentDiff?'is-reference-column':'',unavailable?'is-unavailable':''].filter(Boolean).join(' ');
      return `<td${classes?` class="${classes}"`:''}${current?' aria-current="true"':''} aria-label="${escapeHtml(diff)} · ${pen}고행 · ${escapeHtml(displayed)}">${displayed}</td>`;
    }).join('');
    return `<tr${pen===currentPenance?' class="is-reference-row"':''}><th scope="row"${pen===currentPenance?' class="is-current"':''}>${pen}고행</th>${values}</tr>`;
  }).join('');
  return `<div class="dps-compare-scroll"><table class="dps-compare-matrix${coop?' is-coop':' is-solo'}" aria-label="${coop?'협동전':'개인전'} 고행별 전체 난이도 DPS"><thead><tr><th scope="col">고행</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function dpsCompareFloorsHtml(){
  const teamCount=selectedDpsTableTeamCount();
  const tables=[
    {title:'도전의 탑',diff:'도전의 탑',config:DPS_CONFIG.dpsTable.tower,current:normalizedTowerFloorNumber(challengeTowerFloorStoredValue())},
    {title:planetExplorationDisplayName(currentPlanetExplorationDifficulty()),diff:currentPlanetExplorationDifficulty(),config:DPS_CONFIG.dpsTable.planet,current:normalizedPlanetExplorationFloorNumber(planetExplorationFloorStoredValue())}
  ].filter(item=>!isArtifactDpsViewEnabled() || !artifactDpsUnavailableDifficulty(item.diff)).map(item=>{
    const min=Math.max(1,Math.round(item.config.minFloor||1));
    const max=Math.max(min,Math.round(item.config.maxFloor||1));
    const mid=Math.floor((min+max)/2);
    const halves=[{start:min,end:mid},{start:mid+1,end:max}].map(range=>{
      const rows=[];
      for(let floor=range.start;floor<=range.end;floor++){
        const dps=dpsTablePreviewValue(item.diff,0,floor,{battleMode:'solo',teamCount});
        const current=floor===item.current;
        rows.push(`<tr${current?' class="is-current" aria-current="true"':''}><th scope="row">${floor}층</th><td>${formatDpsCompareValue(dps)}</td></tr>`);
      }
      return `<div class="dps-compare-floor-half"><table class="dps-compare-floor-table" aria-label="${item.title} ${range.start}~${range.end}층 DPS"><thead><tr><th class="dps-compare-floor-range" colspan="2" scope="colgroup">${range.start}~${range.end}층</th></tr><tr><th scope="col">층</th><th scope="col">DPS</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    });
    return `<section class="dps-compare-floor" aria-label="${item.title} 전체 층 DPS"><h3>${item.title}</h3><div class="dps-compare-floor-halves">${halves.join('')}</div></section>`;
  });
  return `<div class="dps-compare-scroll"><div class="dps-compare-floor-grid">${tables.join('')}</div></div>`;
}
function renderDpsCompareContent(){
  const content=$('dpsCompareContent');
  if(!content) return;
  qsa('[data-dps-compare-tab]').forEach(tab=>{
    const active=tab.dataset.dpsCompareTab===activeDpsCompareMode;
    tab.classList.toggle('is-active',active);
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex=active?0:-1;
  });
  content.setAttribute('aria-labelledby',`dpsCompareTab-${activeDpsCompareMode}`);
  content.innerHTML=activeDpsCompareMode==='floor'?dpsCompareFloorsHtml():dpsCompareMatrixHtml(activeDpsCompareMode==='coop');
}
function switchDpsCompareMode(mode){
  if(!['solo','coop','floor'].includes(mode) || mode===activeDpsCompareMode) return;
  activeDpsCompareMode=mode;
  renderDpsCompareContent();
}
let dpsCompareReturnFocus=null;
function openDpsCompareModal(trigger){
  const overlay=$('dpsCompareModalOverlay');
  if(!overlay || !overlay.hidden) return;
  dpsCompareReturnFocus=trigger||document.activeElement;
  activeDpsCompareMode=isTowerDifficulty() || isPlanetExplorationDifficulty() ? 'floor' : (isCoopActive() ? 'coop' : 'solo');
  overlay.hidden=false;
  DPS_BODY.classList.add('dps-compare-modal-open');
  renderDpsCompareContent();
  $('dpsCompareModal')?.focus({preventScroll:true});
}
function closeDpsCompareModal(){
  const overlay=$('dpsCompareModalOverlay');
  if(!overlay || overlay.hidden) return;
  overlay.hidden=true;
  DPS_BODY.classList.remove('dps-compare-modal-open');
  const focus=dpsCompareReturnFocus;
  dpsCompareReturnFocus=null;
  if(focus?.isConnected) focus.focus({preventScroll:true});
}
function bindDpsCompareEvents(){
  const overlay=$('dpsCompareModalOverlay');
  const open=$('dpsCompareOpen');
  if(!overlay || !open) return;
  open.addEventListener('click',()=>openDpsCompareModal(open));
  overlay.addEventListener('click',event=>{
    const tab=event.target.closest('[data-dps-compare-tab]');
    if(tab){ switchDpsCompareMode(tab.dataset.dpsCompareTab); return; }
    if(event.target===overlay || event.target.closest('[data-dps-compare-close]')) closeDpsCompareModal();
  });
  overlay.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-dps-compare-tab]');
    if(tab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      const tabs=[...overlay.querySelectorAll('[data-dps-compare-tab]')];
      const i=tabs.indexOf(tab);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      event.preventDefault();
      switchDpsCompareMode(tabs[next].dataset.dpsCompareTab);
      tabs[next].focus({preventScroll:true});
      return;
    }
    if(event.key==='Escape'){event.preventDefault();closeDpsCompareModal();return;}
    if(event.key!=='Tab') return;
    const dialog=$('dpsCompareModal');
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
    if(!focusable.length){dialog.focus();event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey && (document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  });
}
/* 05-A · 클리어 기록 생성·복사 */
function formatDpsClearReport(report){
  const {context,stageMain,stageRound,achievement,specDps,dpsLabel,required,expected,resourceRows,buildRows,effects,units,sanctuaryRows=[]}=report;
  const lines=[
    '클리어 기록',
    `- 모드 난이도: ${context}`,
    `- 고행: ${stageMain}`,
    `- 라운드: ${stageRound}`,
    `- ${dpsLabel}: ${specDps}`,
    `- 클리어 기준: ${required}`,
    `- 클리어 기대값: ${expected}`,
    `- 클리어 달성률: ${achievement}`,
    '', '재화 현황',
    ...resourceRows.map(({label,value})=>`- ${label}: ${value}`),
    '', '빌드 설정',
    ...buildRows.map(({label,value})=>`- ${label}: ${value}`)
  ];
  for(const group of effects.filter(group=>group.lines.length)){
    lines.push('',group.title,...group.lines.map(line=>`- ${line}`));
  }
  lines.push('', '성소 정보');
  if(sanctuaryRows.length){
    for(const slot of sanctuaryRows) lines.push(`- ${slot.number} · ${slot.start} ~ ${slot.end} · ${slot.skill1||'—'} · ${slot.count1||'—'} · ${slot.skill2||'—'} · ${slot.count2||'—'}`);
  }else lines.push('성소 스킬 사용 없이 클리어됨');
  const totalQuantity=units.reduce((sum,unit)=>sum+Math.max(1,Number(unit.quantity)||1),0);
  lines.push('',`선택 유닛 정보 (${units.length}슬롯 · ${totalQuantity}마리)`);
  for(const unit of units){
    const title=`- ${unit.slot} · ${unit.name} · ${unit.quantity}마리 · 강화 ${unit.enhance}`;
    if(!unit.extras.length){
      lines.push(`${title} · 돌파 ${unit.limitBreak} · ${unit.jewel}`);
    }else{
      lines.push(title,`  - 1번 · 돌파 ${unit.limitBreak} · ${unit.jewel}`,
        ...unit.extras.map(extra=>`  - ${extra.number}번 · 돌파 ${extra.limitBreak} · ${extra.jewel}`));
    }
  }
  return lines.join('\n');
}

// 기존 상세 기록 생성 규칙만 재사용한다. 외부 등록·전송 없이 현재 화면의 기록을 읽는다.
function createDpsClearReport(){
  const artifactView=isArtifactDpsViewEnabled();
  const summary=$('dpsBaseUnitSummary');
  const table=$('dpsBaseUnitSlotStack')?.querySelector('.unit-basic-summary table');
  // 유물 DPS의 스펙 보드 값은 유닛 보드 요약의 표시 여부와 무관하게 읽는다.
  if(!artifactView && (!summary || summary.hidden || !table?.tHead || !table.tBodies.length)){
    return {error:'현재 복사할 유닛 분석 결과가 없습니다.'};
  }
  const selectedSlots=currentDpsBaseUnitSlots();
  const jewels=dpsJewelSettingsObject();
  const unitEntries=selectedSlots.flatMap((id,index)=>{
    const unit=index===dpsUnitSlotPending?.index ? null : dpsBaseUnitById(id);
    return unit?[dpsUnitSummaryEntry(unit,index,jewels)]:[];
  });
  if(!artifactView && !unitEntries.length) return {error:'복사할 유닛이 없습니다.'};
  const readText=selector=>summary?.querySelector(selector)?.textContent.replace(/\s+/g,' ').trim() || '—';
  const readSpecText=selector=>$(selector)?.textContent.replace(/\s+/g,' ').trim() || '—';
  const context=artifactView
    ? [...($('rightHeroCompactContext')?.querySelectorAll('.spec-board-mode,.spec-board-difficulty') || [])].map(el=>el.textContent.replace(/\s+/g,' ').trim()).filter(Boolean).join(' · ') || '—'
    : [readText('.dps-base-unit-context .spec-board-mode'),readText('.dps-base-unit-context .spec-board-difficulty')].filter(value=>value!=='—').join(' · ') || '—';
  const stageMain=artifactView ? readSpecText('specHeroStage') : readText('.unit-summary-stage strong');
  const stageRound=artifactView ? readSpecText('specHeroRound') : readText('.unit-summary-stage small');
  const summaryItems=summary?.querySelectorAll('.dps-base-unit-results > .dps-base-unit-summary-item') || [];
  const metricText=item=>item?.querySelector('.dps-num')?.textContent.replace(/\s+/g,' ').trim() || '—';
  const required=metricText(summaryItems[0]);
  const expected=metricText(summaryItems[1]);
  const achievement=readText('.unit-achievement-value');
  const specDps=readSpecText('dpsVal');
  const dpsLabel=artifactView ? '유물 DPS' : '스펙 DPS';
  if(artifactView && (context === '—' || stageMain === '—' || specDps === '—')){
    return {error:'스펙 보드의 유물 DPS 정보를 확인할 수 없습니다.'};
  }
  const runeNames={ap:'파이널룬',td:'카오스룬',ua:'코스모스룬',harmony:'하모니아룬'};
  const runeName=runeNames[$('runeChoiceType')?.value] || '미분류';
  const readOption=id=>{
    const option=$(id)?.selectedOptions?.[0];
    return !option ? '—' : ['none','없음'].includes(option.value) ? '없음' : option.textContent.trim() || '—';
  };
  const asc=readOption('rAsc');
  const race=readOption('raceOpt');
  const opt10=readOption('opt10');
  const opt15=readOption('opt15');
  const trans=readOption('transOpt');
  const enchants=ENCHANT_INPUT_IDS.map(id=>$(id)?.value.trim() || '—').join(' · ');
  // 재화는 이미 계산되어 표시 중인 분석 보드 값을 읽는다. 계산·저장 상태는 변경하지 않는다.
  const resourceRows=[
    {label:'총 SP',value:($('spTotalBasicView')?.textContent || '—').trim()},
    {label:'사용한 EP',value:($('epUsedBasicView')?.textContent || '—').trim()},
    {label:'사용한 RP',value:($('rpUsedBasicView')?.textContent || '—').trim()},
    {label:'사용한 심연의혼',value:($('soulUsedBasicView')?.textContent || '—').trim()}
  ];
  // 빌드 기본 설정은 항목별로 한 줄씩 출력한다.
  const buildRows=[{label:'룬',value:`${runeName} · 각성 ${asc}`},{label:'종족업',value:race},{label:'10강',value:opt10},{label:'15강',value:opt15},{label:'초월',value:trans},{label:'인첸트',value:enchants}];
  const activeNumber=(id,label)=>{
    const value=Number($(id)?.value || 0);
    return Number.isFinite(value) && value>0 ? `${label} ${value}` : null;
  };
  // 이달의 룬 효과는 월별 항목명 / 적용 수치를 2열로 표시한다.
  const monthRuneRows=[
    {label:'4월',value:[activeNumber('aprRuneNormal','일반'),activeNumber('aprRunePlus','강화')].filter(Boolean).join(' · ')},
    {label:'9월',value:[activeNumber('sepRuneNormal','일반'),activeNumber('sepRunePlus','강화')].filter(Boolean).join(' · ')}
  ].filter(row=>row.value);
  const monthRuneLines=monthRuneRows.map(row=>`${row.label} ${row.value}`);
  const repairValue=$('repairEnhance')?.value;
  const masterValue=$('enhanceMaster')?.value;
  const overEnhance=activeNumber('overEnhance','오버핸스');
  const repairEnhance=['ON','ON+'].includes(repairValue) ? (repairValue==='ON+'?'리페핸스+':'리페핸스') : null;
  const masterEnhance=['ON','ON+'].includes(masterValue) ? (masterValue==='ON+'?'선택 강화':'전체활성화') : null;
  // 방어력 관통은 스펙 보드 정보이므로 클리어 기록에는 중복 출력하지 않는다.
  const enhanceRows=[
    {label:'오버핸스',value:overEnhance?.slice('오버핸스 '.length)},
    {label:'리페핸스',value:repairEnhance},
    {label:'강화의 달인',value:masterEnhance}
  ].filter(row=>row.value);
  const enhanceLines=enhanceRows.map(row=>row.label==='리페핸스' ? row.value : `${row.label} ${row.value}`);
  const buffIds=['prodArtifact','prodNova','prodTeratron','prodAmon','prodAdun','prodKerrigan','prodOvermind','prodNarud','flowerSkill1','flowerSkill2','flowerSkill3'];
  const selectedBuffs=buffIds.map(id=>({id,input:$(id)})).filter(({input})=>input?.checked && !input.disabled);
  const buffNames=(items)=>items.map(({id,input})=>input.closest('label')?.querySelector('span')?.textContent.trim() || id).join(' · ');
  const unitBuffs=buffNames(selectedBuffs.filter(({id})=>id.startsWith('prod')));
  const flowerBuffs=buffNames(selectedBuffs.filter(({id})=>id.startsWith('flower')));
  const buffLines=[unitBuffs && `유닛 버프: ${unitBuffs}`,flowerBuffs && `꽃 버프: ${flowerBuffs}`].filter(Boolean);
  if(!buffLines.length) buffLines.push('없음');
  // 현재 선택된 버프만 종류별 한 줄로 보존한다.
  const effects=[
    {title:'이달의 룬 효과',lines:monthRuneLines},
    {title:'강화 효과',lines:enhanceLines},
    {title:'선택 버프',lines:buffLines}
  ];
  const report={context,stageMain,stageRound,achievement,specDps,dpsLabel,required,expected,resourceRows,buildRows,effects,units:unitEntries,sanctuaryRows:dpsSanctuaryValidRows()};
  return {plainText:formatDpsClearReport(report),unitCount:unitEntries.length,report};
}
async function copyDpsClearRecord(){
  const report=createDpsClearReport();
  const text=(report.plainText || '').replace(/^(\s*)- /gm,'$1');
  if(!text){
    showTraitPresetFeedback('클리어 기록 없음',report.error || '현재 복사할 클리어 기록이 없습니다.','warn',{localOnly:true});
    return;
  }
  const context=traitPresetClearRecordContext();
  let copied=false;
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
      copied=true;
    }
  }catch(error){ /* 클립보드 API 미지원 환경에서는 로컬 선택 복사로 처리 */ }
  if(!copied){
    const selection=document.activeElement;
    const input=document.createElement('textarea');
    input.value=text;
    input.setAttribute('readonly','');
    input.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';
    DPS_BODY.append(input);
    try{input.select();copied=document.execCommand('copy');}catch(error){copied=false;}
    finally{input.remove();if(selection?.isConnected) selection.focus({preventScroll:true});}
  }
  showTraitPresetFeedback(copied?'클리어 기록 복사 완료':'클리어 기록 복사 실패',copied?context:'클리어 기록을 복사할 수 없습니다.',copied?'ok':'err',{localOnly:true,durationMs:5000,glyph:copied?'copy':'',share:copied?'나만의 클리어 기록을 다른 유저들과 공유해 보세요!':''});
}
/* ── 06 · 저장 필드 레지스트리 ── */
const FIELD_REGISTRY={
  sp:{kind:'기본 정보',name:'시작 SP',save:true},
  xp:{kind:'기본 정보',name:'보유 XP',save:true},
  bxp:{kind:'기본 정보',name:'보유 BXP',save:true},
  rp:{kind:'기본 정보',name:'보유 RP',save:true},
  soul:{kind:'기본 정보',name:'본인 심연의혼',save:true},
  coralShard:{kind:'목표설정',name:'코랄의 파편',save:true},
  aiurShard:{kind:'목표설정',name:'아이어의 파편',save:true},
  xerusShard:{kind:'목표설정',name:'제루스의 파편',save:true},
  diff:{kind:'목표설정',name:'난이도',save:true},
  round:{kind:'목표설정',name:'목표 라운드',save:true},
  challengeTowerFloor:{kind:'목표설정',name:'도전의 탑 층',save:true},
  planetExplorationFloor:{kind:'목표설정',name:'행성탐사 층',save:true},
  soloMode:{kind:'목표설정',name:'개인전',save:true},
  coopMode:{kind:'목표설정',name:'협동전',save:true},
  coopPassenger2Dr:{kind:'목표설정',name:'협동전 2P 방어력 감소',save:true},
  coopPassenger3Dr:{kind:'목표설정',name:'협동전 3P 방어력 감소',save:true},
  team:{kind:'목표설정',name:'출발 지원 인원수',save:true},
  pbless:{kind:'목표설정',name:'파워 블레스',save:true},
  spBankApply:{kind:'기본 정보',name:'SP 은행',save:true},
  penance:{kind:'목표설정',name:'고행 단계',save:true},
  titleTdBonus:{kind:'목표설정',name:'타이틀 총 데미지',save:true},
  specDpsSpeedMode:{kind:'스펙 보드',name:'스피드 모드',save:true},
  dpsBaseUnits:{kind:'유닛 보드',name:'유닛 구성',save:true},
  dpsBaseUnitSlots:{kind:'유닛 보드',name:'유닛 선택 위치',save:true},
  dpsBaseUnitVisibleSlotCount:{kind:'유닛 보드',name:'표시 슬롯 수',save:true},
  dpsJewelSettings:{kind:'쥬얼 설정',name:'전설·신화 쥬얼',save:true},
  dpsBaseUnitExtraSettings:{kind:'유닛 보드',name:'추가 유닛 쥬얼 & 한계 돌파',save:true},
  dpsBaseUnitSlotExpansions:{kind:'유닛 보드',name:'슬롯 확장',save:true},
  dpsBaseUnitSpeedMode:{kind:'유닛 보드',name:'스피드 모드',save:true},
  dpsSanctuaryInfo:{kind:'유닛 보드',name:'성소 정보',save:true},
  erosionStack:{kind:'목표설정',name:'어비스 침식 스택',save:true},
  jewelErosionRes:{kind:'목표설정',name:'어비스 심연 내성',save:true},
  aprRuneNormal:{kind:'룬효과 버프',name:'4월 일반',save:true},
  aprRunePlus:{kind:'룬효과 버프',name:'4월 강화(+)',save:true},
  sepRuneNormal:{kind:'룬효과 버프',name:'9월 일반',save:true},
  sepRunePlus:{kind:'룬효과 버프',name:'9월 강화(+)',save:true},
  overEnhance:{kind:'룬효과 버프',name:'오버핸스',save:true},
  repairEnhance:{kind:'룬효과 버프',name:'리페핸스',save:true},
  enhanceMaster:{kind:'룬효과 버프',name:'강화의 달인',save:true},
  prodArtifact:{kind:'룬효과 버프',name:'유물',save:true},
  prodNova:{kind:'룬효과 버프',name:'비밀 작전 노바',save:true},
  prodTeratron:{kind:'룬효과 버프',name:'테라트론',save:true},
  prodAmon:{kind:'룬효과 버프',name:'아몬',save:true},
  prodAdun:{kind:'룬효과 버프',name:'아둔의 창',save:true},
  prodKerrigan:{kind:'룬효과 버프',name:'불새 케리건',save:true},
  prodOvermind:{kind:'룬효과 버프',name:'초월체',save:true},
  prodNarud:{kind:'룬효과 버프',name:'나루드',save:true},
  flowerSkill1:{kind:'룬효과 버프',name:'근성의 꽃가루',save:true},
  flowerSkill2:{kind:'룬효과 버프',name:'바람의 꽃가루',save:true},
  flowerSkill3:{kind:'룬효과 버프',name:'안개의 꽃가루',save:true},
  specBoardPierce:{kind:'룬효과 버프',name:'방어력 관통',save:true},
  donationBuffType:{kind:'룬효과 버프',name:'나눔 유저 적용',save:false},
  rAD:{kind:'룬정보',name:'공격력',save:true},
  rModAD:{kind:'룬정보',name:'공격력 개조',save:true},
  runeChoiceType:{kind:'룬정보',name:'룬 특수 옵션',save:true},
  runeChoiceValue:{kind:'룬정보',name:'룬 특수 옵션',save:true},
  rAS:{kind:'룬정보',name:'공격속도',save:true},
  rModAS:{kind:'룬정보',name:'공격속도 개조',save:true},
  rCD:{kind:'룬정보',name:'크리 데미지',save:true},
  rModCD:{kind:'룬정보',name:'크리 데미지 개조',save:true},
  rCRI:{kind:'룬정보',name:'크리 확률',save:true},
  rModCRI:{kind:'룬정보',name:'크리 확률 개조',save:true},
  rReinf:{kind:'룬정보',name:'룬 강화 수',save:true},
  rAsc:{kind:'룬정보',name:'룬 각성',save:true},
  raceOpt:{kind:'룬정보',name:'종족 업그레이드',save:true},
  opt10:{kind:'룬정보',name:'10강 옵션',save:true},
  opt15:{kind:'룬정보',name:'15강 옵션',save:true},
  transOpt:{kind:'룬정보',name:'초월 옵션',save:true},
  additionalRuneSlots:{kind:'에디셔널',name:'룬 10칸 설정',save:true},
  addAD:{kind:'에디셔널',name:'공격력',save:false},
  addAS:{kind:'에디셔널',name:'공격속도',save:false},
  addCD:{kind:'에디셔널',name:'크리 데미지',save:false},
  addCRI:{kind:'에디셔널',name:'크리 확률',save:false},
  addAP:{kind:'에디셔널',name:'마법공격력',save:false},
  addTD:{kind:'에디셔널',name:'총 데미지',save:false},
  addUA:{kind:'에디셔널',name:'유닛 가속',save:false},
  enchAD:{kind:'인첸트 레벨 / 결과',name:'공격력',save:true},
  enchCRI:{kind:'인첸트 레벨 / 결과',name:'크리 확률',save:true},
  enchUA:{kind:'인첸트 레벨 / 결과',name:'유닛 가속',save:true},
  enchTD:{kind:'인첸트 레벨 / 결과',name:'총 데미지',save:true},
  enchSR:{kind:'인첸트 레벨 / 결과',name:'실드 감소',save:true},
  enchHR:{kind:'인첸트 레벨 / 결과',name:'체력 감소',save:true},
  enchantCode:{kind:'인첸트 레벨 / 결과',name:'인첸트 코드',save:true},
  optTier:{kind:'특성 보드',name:'특성 최적화',save:true},
  utilOptTier:{kind:'특성 보드',name:'유틸 마스터',save:true},
  traitLimitAD:{kind:'특성 투자 제한',name:'공격력',save:true},
  traitLimitAS:{kind:'특성 투자 제한',name:'공격속도',save:true},
  traitLimitCRI:{kind:'특성 투자 제한',name:'크리 확률',save:true},
  traitLimitCD:{kind:'특성 투자 제한',name:'크리 데미지',save:true},
  traitLimitLifeBonus:{kind:'특성 투자 제한',name:'목숨 보너스',save:true},
  traitLimitMagicAP:{kind:'특성 투자 제한',name:'마법공격력 1·2·3',save:true},
  traitLimitMultiTarget:{kind:'특성 투자 제한',name:'멀티 타겟',save:true},
  traitLimitInfinite:{kind:'특성 투자 제한',name:'무한특성',save:true},
  skillDouble:{kind:'성소 보드',name:'더블스페',save:true},
  skillMode:{kind:'성소 보드',name:'모드',save:true},
  skillRound:{kind:'성소 보드',name:'라운드',save:true},
  unitGrade:{kind:'룬효과 버프',name:'유닛 등급'},
  unitLevel:{kind:'룬효과 버프',name:'유닛 레벨'},
};

/* ── 07 · 유닛 보드 상태·표시: unit.js로 이동 ── */
/* ── 08 · 유닛 상세·쥬얼·성소: unit.js로 이동 ── */
/* ── 09 · 통합 헤더·화면 전환 ── */
/* 탭 공통: Home/End/좌우 화살표의 순환 이동 인덱스 */
function nextHorizontalTabIndex(key,current,length){
  return key==='Home'?0:key==='End'?length-1:(current+(key==='ArrowRight'?1:-1)+length)%length;
}
/* 통합 헤더 하위 탭: 원래 DOM을 유지하여 계산·저장 필드 재생성을 방지 */
function activateIntegratedTab(group,index){
  const tabs=[...qsa(`[data-integrated-tab="${group}"]`)];
  const panels=qsa(`[data-integrated-panel="${group}"]`);
  if(!tabs.some(button=>button.dataset.integratedIndex===String(index))) return;
  tabs.forEach(button=>{
    const active=button.dataset.integratedIndex===String(index);
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
  });
  panels.forEach(panel=>{
    const active=panel.dataset.integratedIndex===String(index);
    panel.classList.toggle('is-active',active);
    panel.hidden=!active;
  });
  if(group==='traitWorkspace'){
    const expansionToggle=$('traitExpansionToggle');
    if(expansionToggle) expansionToggle.hidden=index!==1;
    if(index!==0) setBattleModeGuideVisible(false);
  }
}
function bindIntegratedTabEvents(){
  DPS_BODY.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-integrated-tab]');
    if(!button) return;
    activateIntegratedTab(button.dataset.integratedTab,Number(button.dataset.integratedIndex));
  });
  DPS_BODY.addEventListener('keydown',event=>{
    const button=event.target.closest?.('[data-integrated-tab]');
    if(!button || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const group=button.dataset.integratedTab;
    const tabs=[...qsa(`[data-integrated-tab="${group}"]`)];
    const current=tabs.indexOf(button);
    const next=nextHorizontalTabIndex(event.key,current,tabs.length);
    event.preventDefault();
    activateIntegratedTab(group,Number(tabs[next].dataset.integratedIndex));
    tabs[next].focus({preventScroll:true});
  });
  // Each jewel disclosure retains its controls and data when folded.
  DPS_BODY.addEventListener('click',event=>{
    const toggle=event.target.closest?.('[data-dps-jewel-toggle]');
    if(!toggle) return;
    const card=toggle.closest('[data-dps-jewel-card]');
    const wasOpen=card?.classList.contains('is-expanded');
    qsa('#dpsJewelConfigGrid [data-dps-jewel-card]').forEach(item=>{
      item.classList.remove('is-expanded');
      item.querySelector('[data-dps-jewel-toggle]')?.setAttribute('aria-expanded','false');
      const content=item.querySelector('.dps-jewel-card-detail');
      if(content) content.hidden=true;
    });
    if(card && !wasOpen){
      card.classList.add('is-expanded');
      toggle.setAttribute('aria-expanded','true');
      const content=card.querySelector('.dps-jewel-card-detail');
      if(content) content.hidden=false;
    }
  });
}

/* 스펙·유닛 보드 전환 및 상태 이벤트 */
let activeDamageBoardMode='spec';
function setDamageBoardTab(active){
  const next=['spec','unit','jewel'].includes(active) ? active : activeDamageBoardMode;
  activeDamageBoardMode=next;
  qsa('[data-damage-board-subtab]').forEach(tab=>{
    const isActive=tab.dataset.damageBoardSubtab===next;
    tab.classList.toggle('is-active',isActive);
    tab.setAttribute('aria-selected',String(isActive));
    tab.tabIndex=isActive?0:-1;
  });
  const panelMode=next==='jewel'?'unit':next;
  qsa('[data-damage-board-panel]').forEach(panel=>{
    const isActive=panel.dataset.damageBoardPanel===panelMode;
    panel.classList.toggle('is-active',isActive);
    panel.hidden=!isActive;
  });
  qsa('[data-damage-board-unit-panel]').forEach(panel=>{
    const isActive=panel.dataset.damageBoardUnitPanel===(next==='jewel'?'jewel':'unit');
    panel.classList.toggle('is-active',isActive);
    panel.hidden=!isActive;
  });
  if(next!=='unit') setUnitSanctuaryGuideVisible(false);
  if(next==='jewel') renderDpsJewelConfigGrids();
}
function bindDamageBoardTabEvents(){
  DPS_BODY.addEventListener('click',event=>{
    const tab=event.target?.closest?.('[data-damage-board-subtab]');
    if(!tab || tab.disabled || tab.dataset.damageBoardSubtab==='dps') return;
    event.preventDefault();
    setDamageBoardTab(tab.dataset.damageBoardSubtab);
  },true);
  DPS_BODY.addEventListener('keydown',event=>{
    const tab=event.target?.closest?.('[data-damage-board-subtab]');
    if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs=[...tab.parentElement.querySelectorAll('[data-damage-board-subtab]')].filter(button=>!button.disabled);
    const current=tabs.indexOf(tab);
    if(current<0 || !tabs.length) return;
    const next=nextHorizontalTabIndex(event.key,current,tabs.length);
    event.preventDefault();
    if(tabs[next].dataset.damageBoardSubtab==='dps') openDpsCompareModal(tabs[next]);
    else {
      setDamageBoardTab(tabs[next].dataset.damageBoardSubtab);
      tabs[next].focus({preventScroll:true});
    }
  });
}
function setBattleModeGuideVisible(visible){
  const guide=$('battleModeGuideDetails'), trigger=$('battleModeGuideOpen');
  if(!guide || !trigger || guide.hidden===!visible) return;
  guide.hidden=!visible;
  $('traitLimitContent').hidden=visible;
  $('traitOptimizeContent').hidden=visible;
  $('battleModeGuideTitle').textContent=visible?'최적화 안내':'투자 제한';
  trigger.setAttribute('aria-expanded',String(visible));
  trigger.querySelector('span').textContent=visible?'뒤로가기':'최적화 안내';
  trigger.querySelector('use').setAttribute('href',visible?'#dpsUiBackGlyph':'#dpsUiInfoGlyph');
}
function bindDamageBoardSwitchEvents(){
  const guide=$('battleModeGuideDetails');
  const guideOpen=$('battleModeGuideOpen');
  if(guide && guideOpen){
    guideOpen.addEventListener('click',()=>setBattleModeGuideVisible(guide.hidden));
  }
  DPS_BODY.addEventListener('click', e=>{
    const speedToggle=e.target?.closest?.('[data-spec-dps-speed-toggle]');
    if(speedToggle){
      e.preventDefault();
      toggleSpecDpsSpeedMode();
      return;
    }
    const artifactToggle=e.target?.closest?.('#artifactDpsViewToggle');
    if(!artifactToggle) return;
    e.preventDefault();
    if(artifactToggle.disabled || artifactDpsUnavailableDifficulty()) return;
    setArtifactDpsViewEnabled(!isArtifactDpsViewEnabled());
    requestAppUpdate();
  }, true);
}
/* ── 10 · 특성 보드·투자·최적화 ── */
const OPTIMIZATION_TIERS=TIERS;
// 게임 모드에 따른 특성 입력 제한을 두지 않는다. 기존 효과 계산 조건은 그대로 유지한다.
/* 10-A · 특성 표시·투자 가능 상태 */
// 펼침 여부는 화면 상태로만 관리하며 프리셋 데이터에는 저장하지 않는다.
const TRAIT_EXPANSION_KEY='vaeron.builder.traitListExpanded';
let keepTraitTiersExpanded=false;
try{keepTraitTiersExpanded=localStorage.getItem(TRAIT_EXPANSION_KEY)==='true';}catch{}
const expandedTraitTiers=new Set(keepTraitTiersExpanded?TIERS:[]);
function syncTraitExpansionButton(){
  const button=$('traitExpansionToggle');
  if(!button) return;
  if(button.getAttribute('aria-pressed')!==String(keepTraitTiersExpanded)) button.setAttribute('aria-pressed',String(keepTraitTiersExpanded));
  const label=keepTraitTiersExpanded?'펼친 상태 유지 · 접힌 상태 유지로 전환':'접힌 상태 유지 · 펼친 상태 유지로 전환';
  if(button.getAttribute('aria-label')!==label) button.setAttribute('aria-label',label);
  if(button.dataset.nexusControlName!==label) button.dataset.nexusControlName=label;
}
function toggleTraitExpansionMode(){
  keepTraitTiersExpanded=!keepTraitTiersExpanded;
  try{localStorage.setItem(TRAIT_EXPANSION_KEY,String(keepTraitTiersExpanded));}catch{}
  expandedTraitTiers.clear();
  if(keepTraitTiersExpanded) TIERS.forEach(tier=>expandedTraitTiers.add(tier));
  qsa('.trait-tier-panel[data-tier]').forEach(panel=>{
    panel.querySelector('.trait-invest-list')?.getAnimations?.().forEach(animation=>animation.cancel());
  });
  updateTraits();
}
// 입력 요소를 DOM에 그대로 둔 채 높이만 애니메이션으로 전환한다.
function setAccordionContentExpanded(content,expanded){
  if(!content) return;
  const oldAnimation=content.getAnimations?.().find(animation=>animation.id==='dpsAccordion');
  oldAnimation?.cancel();
  const wasOpen=!content.hidden;
  const fromHeight=wasOpen ? content.getBoundingClientRect().height : 0;
  if(expanded) content.hidden=false;
  content.inert=!expanded;
  content.setAttribute('aria-hidden',String(!expanded));
  if(fromHeight===0 && !expanded){content.hidden=true;return;}
  const toHeight=expanded ? content.scrollHeight : 0;
  if(Math.abs(fromHeight-toHeight)<1 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !content.animate){
    content.hidden=!expanded;
    return;
  }
  const animation=content.animate([{height:`${fromHeight}px`,opacity:expanded?0:1},{height:`${toHeight}px`,opacity:expanded?1:0}],{duration:250,easing:'cubic-bezier(.22,1,.36,1)'});
  animation.id='dpsAccordion';
  animation.onfinish=()=>{if(!expanded) content.hidden=true;};
}
function setTraitTierExpanded(tier,expanded,exclusive=true){
  if(!TIERS.includes(tier) || keepTraitTiersExpanded) return;
  if(expanded && exclusive) [...expandedTraitTiers].filter(open=>open!==tier).forEach(open=>setTraitTierExpanded(open,false));
  if(expanded) expandedTraitTiers.add(tier);
  else expandedTraitTiers.delete(tier);
  const panel=Array.from(qsa('.trait-tier-panel[data-tier]')).find(el=>el.dataset.tier===tier);
  if(!panel) return;
  const toggle=panel.querySelector('.trait-tier-toggle');
  const list=panel.querySelector('.trait-invest-list');
  panel.classList.toggle('is-expanded',expanded);
  if(toggle) toggle.setAttribute('aria-expanded',String(expanded));
  setAccordionContentExpanded(list,expanded);
}
function traitNextInvestmentLabel(row,isMax,cost){
  if(row===45 && !isCoopMode()) return '협동전 전용';
  return isMax ? '✓ 마스터 완료' : `다음 투자 · ${fullNumber(cost)}`;
}
function buildTraitBoard(){
  const body=$('traitBody');
  if(!body) return;
  body.innerHTML=TIERS.map((tier,tierIndex)=>{
    const tierTraits=TRAITS.filter(t=>t[2]===tier && t[0]!==116);
    const eligibleTierTraits=tierTraits;
    const tierInvested=eligibleTierTraits.reduce((sum,t)=>sum+(INV[t[0]]||0),0);
    const tierMaximum=eligibleTierTraits.reduce((sum,t)=>sum+(TMAX[t[0]]||999),0);
    const tierMastered=eligibleTierTraits.length>0 && eligibleTierTraits.every(t=>(INV[t[0]]||0)>=(TMAX[t[0]]||999));
    const tierSummary=tierInvested>0
      ? `<span class="collapsed-summary trait-tier-summary${tierMastered?' is-mastered':''}">${tierMastered?'✓ 전체 마스터':`${fullNumber(tierInvested)} / ${fullNumber(tierMaximum)}`}</span>`
      : '';
    const rows=tierTraits.map((t,index)=>{
      const [row,name,,type,rate]=t;
      const n=INV[row]||0, mx=TMAX[row]||999;
      const isMax=n>=mx;
      const cost=nextCost(row);
      // 어비스 난이도의 특성별 계수는 기존 DPS 계산과 동일하게 표시한다.
      const currentRate=isAbyssDifficulty() ? ({133:15,134:7.5,135:1.5,136:3}[row] ?? rate) : rate;
      const rStr=row===58?'강화수 +1':row===96?'2단 강화 +0.5':traitEffectText(row,type,currentRate);
      return `<article class="tr trait-invest-card${isMax?' is-mastered':''}" data-trait-id="${row}">
        <div class="trait-invest-main">
          <span class="trait-invest-index" aria-hidden="true">${String(index+1).padStart(2,'0')}</span>
          <div class="trait-row-detail">
            <div class="trait-invest-topline"><div class="tr-name">${escapeHtml(name)}</div><div class="tr-type"><span class="trait-effect-text">${escapeHtml(rStr)}</span><span class="trait-cost-chip ${isMax?'is-complete':''}">${traitNextInvestmentLabel(row,isMax,cost)}</span></div></div>
          </div>
        </div>
        <div class="tr-ctrl" aria-label="${escapeHtml(name)} 투자 조절">
          <button type="button" class="ui-step-btn" data-action="traitAdjust" data-row="${row}" data-delta="-1" ${n<=0?'disabled':''} aria-label="${escapeHtml(name)} 1 환불">−</button>
          <div class="trait-value-pair">
            <input class="tv-input" type="text" inputmode="numeric" value="${n}" data-row="${row}" aria-label="${escapeHtml(name)} 현재 투자">
            <span class="trait-max-sep">/</span><span class="trait-max-val">${mx}</span>
          </div>
          <button type="button" class="ui-step-btn" data-action="traitAdjust" data-row="${row}" data-delta="1" ${isMax?'disabled':''} aria-label="${escapeHtml(name)} 1 투자">+</button>
          <button type="button" class="ui-action-btn trait-master-btn" data-action="traitMax" data-row="${row}" ${isMax?'disabled':''}>마스터</button>
          ${mx>=50 ? `<div class="trait-quick-actions">
            ${[10,50].map(step=>`<button type="button" data-action="traitQuickAdjust" data-row="${row}" data-step="${step}" ${mx-n<step?'disabled':''} aria-label="${escapeHtml(name)} ${step}회 추가 투자">+${step}</button>`).join('')}
          </div>` : ''}
        </div>
      </article>`;
    }).join('');
    const isExpanded=expandedTraitTiers.has(tier);
    return `<section class="trait-group trait-tier-panel${isExpanded?' is-expanded':''}" data-tier-index="${tierIndex+1}" data-tier="${tier}">
      <h4><button type="button" class="trait-tier-toggle" data-action="toggleTraitTier" data-tier="${tier}" aria-expanded="${isExpanded}" aria-controls="traitTierContent${tierIndex+1}"><span class="trait-title"><span class="trait-tier-index" aria-hidden="true">${String(tierIndex+1).padStart(2,'0')}</span><span class="trait-tier-name">${tier}</span></span>${tierSummary}</button><span class="trait-tools"><button type="button" class="ui-action-btn mini-btn master" data-action="masterTier" data-tier="${tier}">구간 마스터</button><button type="button" class="ui-action-btn mini-btn reset ui-reset-btn" data-action="resetTier" data-tier="${tier}"><svg class="ui-command-glyph" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#dpsUiResetGlyph"/></svg><span>초기화</span></button></span></h4>
      <div class="trait-invest-list" id="traitTierContent${tierIndex+1}" ${isExpanded?'':'hidden'}>${rows}</div>
    </section>`;
  }).join('');
}
const traitBoardNodes=new WeakMap();
function updateTraits(){
  syncTraitExpansionButton();
  const body=$('traitBody');
  if(!body) return;
  let cached=traitBoardNodes.get(body);
  if(!cached || !cached.groups[0]?.panel.isConnected){
    buildTraitBoard();
    cached={groups:TIERS.map(tier=>{
      const panel=Array.from(body.children).find(el=>el.dataset.tier===tier);
      return {tier,panel,toggle:panel.querySelector('.trait-tier-toggle'),list:panel.querySelector('.trait-invest-list'),traits:TRAITS.filter(t=>t[2]===tier && t[0]!==116).map(trait=>{
        const card=panel.querySelector(`[data-trait-id="${trait[0]}"]`);
        return {trait,card,input:card.querySelector('.tv-input'),cost:card.querySelector('.trait-cost-chip'),effect:card.querySelector('.trait-effect-text'),buttons:[...card.querySelectorAll('button')],summary:null};
      })};
    })};
    traitBoardNodes.set(body,cached);
  }
  const abyss=isAbyssDifficulty();
  const text=(el,value)=>{if(el.textContent!==value) el.textContent=value;};
  for(const group of cached.groups){
    let invested=0,maximum=0,mastered=group.traits.length>0;
    for(const {trait,card,input,cost,effect,buttons} of group.traits){
      const [row,,,type,rate]=trait, n=INV[row]||0, mx=TMAX[row]||999, isMax=n>=mx;
      invested+=n;maximum+=mx;mastered=mastered&&isMax;
      card.classList.toggle('is-mastered',isMax);
      if(input.value!==String(n)) input.value=String(n);
      const currentRate=abyss?({133:15,134:7.5,135:1.5,136:3}[row]??rate):rate;
      text(effect,row===58?'강화수 +1':row===96?'2단 강화 +0.5':traitEffectText(row,type,currentRate));
      text(cost,traitNextInvestmentLabel(row,isMax,nextCost(row)));
      cost.classList.toggle('is-complete',isMax);
      for(const button of buttons){
        const disabled=button.dataset.action==='traitQuickAdjust' ? mx-n<Number(button.dataset.step) : button.dataset.delta==='-1' ? n<=0 : isMax;
        if(button.disabled!==disabled) button.disabled=disabled;
      }
    }
    let summary=group.toggle.querySelector('.trait-tier-summary');
    if(invested>0){
      if(!summary){summary=document.createElement('span');summary.className='collapsed-summary trait-tier-summary';group.toggle.append(summary);}
      text(summary,mastered?'✓ 전체 마스터':`${fullNumber(invested)} / ${fullNumber(maximum)}`);
      summary.classList.toggle('is-mastered',mastered);
    }else summary?.remove();
    const expanded=expandedTraitTiers.has(group.tier);
    if(group.list.inert===expanded) group.list.inert=!expanded;
    if(group.list.getAttribute('aria-hidden')!==String(!expanded)) group.list.setAttribute('aria-hidden',String(!expanded));
    group.panel.classList.toggle('is-expanded',expanded);
    if(group.toggle.getAttribute('aria-expanded')!==String(expanded)) group.toggle.setAttribute('aria-expanded',String(expanded));
    if(!group.list.getAnimations?.().some(animation=>animation.id==='dpsAccordion') && group.list.hidden===expanded) group.list.hidden=!expanded;
  }
}
/* 수동 특성 입력·반복 투자 이벤트 */
let traitKeyNavGuardUntil=0;
/* 10-B · 수동 투자·반복 입력 */
function commitTraitInput(el){
  const row=+(el && el.dataset ? el.dataset.row : NaN);
  if(!Number.isFinite(row) || el.disabled) return;
  setInv(row,+el.value);
}
function getTraitScrollHost(){
  return qs('.mobile-page-trait.active') || qs('.col-mid') || DPS_BODY;
}
function getNextTraitInputRow(el,dir){
  const inputs=Array.from(qsa('.tv-input[data-row]:not(:disabled)'));
  const idx=inputs.indexOf(el);
  const nextIndex=Math.max(0,Math.min(inputs.length-1,idx+dir));
  return +(inputs[nextIndex]?.dataset?.row ?? el?.dataset?.row);
}
function focusTraitInputRow(row,hostScroll,pageX,pageY){
  const host=getTraitScrollHost();
  const focusNow=()=>{
    const next=qs(`.tv-input[data-row="${row}"]`);
    if(!next) return false;
    const panel=next.closest('.trait-tier-panel[data-tier]');
    if(panel && !expandedTraitTiers.has(panel.dataset.tier)) setTraitTierExpanded(panel.dataset.tier,true);
    try{next.focus({preventScroll:true});}catch{next.focus();}
    if(typeof next.select==='function') next.select();
    if(host) host.scrollTop=hostScroll;
    const page=window.NEXUS_WINDOW_MODE==='combined' ? window : window.NEXUS_WINDOW_MODE==='builder' ? DPS_ROOT : DPS_BODY;
    page.scrollTo(pageX,pageY);
    return true;
  };
  setTimeout(()=>{ if(!focusNow()) requestAnimationFrame(focusNow); },0);
}
function bindTraitInputEvents(){
  DPS_BODY.addEventListener('change', e=>{
    if(Date.now()<traitKeyNavGuardUntil) return;
    const input=e.target.closest && e.target.closest('.tv-input[data-row]');
    if(input) commitTraitInput(input);
  }, true);
  DPS_BODY.addEventListener('keydown', e=>{
    const input=e.target.closest && e.target.closest('.tv-input[data-row]');
    if(!input || (e.key!=='Tab' && e.key!=='Enter')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const dir=e.shiftKey?-1:1;
    const nextRow=getNextTraitInputRow(input,dir);
    const host=getTraitScrollHost();
    const hostScroll=host ? host.scrollTop : 0;
    const page=window.NEXUS_WINDOW_MODE==='combined' ? window : window.NEXUS_WINDOW_MODE==='builder' ? DPS_ROOT : DPS_BODY;
    const pageX=page===window ? window.scrollX : page.scrollLeft;
    const pageY=page===window ? window.scrollY : page.scrollTop;
    traitKeyNavGuardUntil=Date.now()+250;
    commitTraitInput(input);
    focusTraitInputRow(nextRow,hostScroll,pageX,pageY);
  }, true);
  DPS_BODY.addEventListener('click', e=>{
    const target=e.target;
    if(!(target instanceof Element)) return;
    const input=target.closest('.tv-input[data-row]');
    if(input){input.select();return;}
    const card=target.closest('.trait-invest-card[data-trait-id]');
    if(!card || target.closest('button, a, select, textarea, input, [role="button"]')) return;
    const field=card.querySelector('.tv-input[data-row]');
    if(!field || field.disabled || field.readOnly) return;
    field.focus({preventScroll:true});
    field.select();
  }, true);
}
function showTraitInvestmentFeedback(row,message){
  showInlineFeedback(qs(`.trait-invest-card[data-trait-id="${row}"]`),message);
}
function showTraitScopeFeedback(action,message){
  showInlineFeedback(qs(`[data-action="${action}"]`)?.closest('.trait-optimizer-row'),message);
}
function adjustTraitBy(row,d,step=1){
  row=+row;
  d=+d;
  step=Math.max(1,Math.round(+step||1));
  if(row===116 || !Number.isFinite(row) || !Number.isFinite(d) || d===0) return false;
  const before=INV[row]||0;
  let applied=0;
  if(d>0){
    applied=setRowToAffordableValue(row,before+step)-before;
    if(applied===0) showTraitInvestmentFeedback(row,'보유 재화가 부족합니다');
  }else{
    const next=Math.max(0,before-step);
    applied=before-next;
    INV[row]=next;
  }
  if(applied>0){
    commitAppUpdate({recalculate:'now'});
    return true;
  }
  return false;
}
let traitHoldTimer=null;
let traitHoldRepeatTimer=null;
let traitHoldSuppressClickUntil=0;
function stopTraitAdjustHold(){
  if(traitHoldTimer) clearTimeout(traitHoldTimer);
  if(traitHoldRepeatTimer) clearTimeout(traitHoldRepeatTimer);
  traitHoldTimer=null;
  traitHoldRepeatTimer=null;
  traitHoldSuppressClickUntil=Date.now()+260;
}
function startTraitAdjustHold(trigger,e){
  if(!trigger || trigger.disabled) return;
  const row=+trigger.dataset.row;
  const delta=+trigger.dataset.delta;
  if(!Number.isFinite(row) || !Number.isFinite(delta) || delta===0) return;
  if(e){ e.preventDefault(); e.stopPropagation(); }
  stopTraitAdjustHold();
  let count=0;
  const every=Math.max(1,DPS_CONFIG.ui.traitHoldAccelEvery||7);
  const maxStep=Math.max(1,DPS_CONFIG.ui.traitHoldMaxStep||50);
  const apply=()=>{
    const step=Math.min(maxStep, 1+Math.floor(count/every));
    count++;
    adjustTraitBy(row,delta,step);
  };
  apply();
  traitHoldTimer=setTimeout(function repeat(){
    apply();
    traitHoldRepeatTimer=setTimeout(repeat, DPS_CONFIG.ui.traitHoldRepeatMs||55);
  }, DPS_CONFIG.ui.traitHoldInitialDelay||320);
}
function commitTraitInvestmentChange(){
  commitAppUpdate({recalculate:'now'});
}
function bindTraitHoldEvents(){
  DPS_BODY.addEventListener('pointerdown', e=>{
    const btn=e.target.closest('[data-action="traitAdjust"]');
    if(!btn) return;
    startTraitAdjustHold(btn,e);
  }, true);
  ['pointerup','pointercancel','pointerleave','blur'].forEach(type=>{
    window.addEventListener(type, stopTraitAdjustHold, true);
  });
}
function setInv(row,val){
  if(row===116) return;
  if(isNaN(val)||val<0) val=0;
  const wanted=Math.round(val);
  const applied=setRowToAffordableValue(row,wanted);
  if(applied<wanted) showTraitInvestmentFeedback(row,'보유 재화 한도까지만 입력되었습니다');
  commitTraitInvestmentChange();
}
function adjMax(row){
  try{
    if(row===116) return false;
    const before=INV[row]||0;
    fillRowToBudget(row);
    commitTraitInvestmentChange();
    if((INV[row]||0)<=before) showTraitInvestmentFeedback(row,'보유 재화가 부족합니다');
    return (INV[row]||0)>before;
  }catch(e){
    rememberAppIssue('error','[adjMax failed]', e);
    return false;
  }
}
function forEachTraitInTier(tier, callback){
  TRAITS.forEach(t=>{
    const row=t[0];
    if(t[2]!==tier || row===116) return;
    callback(t,row);
  });
}
function masterTier(tier){
  forEachTraitInTier(tier,(_,row)=>fillRowToBudget(row));
  commitTraitInvestmentChange();
}
function resetTier(tier){
  forEachTraitInTier(tier,(_,row)=>{ INV[row]=0; });
  commitTraitInvestmentChange();
}
/* 특성 초기화·유틸 최적화 */
const UTILITY_OPT_TYPES=new Set(['유틸','경험치','AP','RA']);
const UTILITY_OPT_TIERS=OPTIMIZATION_TIERS;
/* 10-C · 재화별 투자 초기화·최적화 */
function isUtilityOptimizationTrait(t, maxTierIndex=null){
  if(!Array.isArray(t)) return false;
  const row=t[0], tier=t[2], type=t[3];
  if(row===116 || row===112) return false;
  if(row===45 && !isCoopMode()) return false;
  if(row===51 && !traitLimitSwitchOn('traitLimitLifeBonus')) return false;
  if(type==='AP' && !traitLimitSwitchOn('traitLimitMagicAP')) return false;
  const tierIdx=UTILITY_OPT_TIERS.indexOf(tier);
  if(tierIdx<0) return false;
  if(maxTierIndex!==null && tierIdx>maxTierIndex) return false;
  return UTILITY_OPT_TYPES.has(type);
}
function utilityRowsOrNotify(){
  const idx=UTILITY_OPT_TIERS.indexOf(vs('utilOptTier')||'루키');
  const maxTierIndex=idx>=0 ? idx : UTILITY_OPT_TIERS.indexOf('더원2');
  const rows=TRAITS.filter(t=>isUtilityOptimizationTrait(t, maxTierIndex)).map(t=>t[0]);
  if(rows.length) return rows;
  showTraitScopeFeedback('optimizeUtility','선택 범위에 유틸 특성이 없습니다');
  return null;
}
function optimizeUtility(){
  const rows=utilityRowsOrNotify();
  if(!rows) return false;
  let changed=0;
  rows.forEach(row=>{
    const before=INV[row]||0;
    fillRowToBudget(row);
    if((INV[row]||0)!==before) changed++;
  });
  commitTraitInvestmentChange();
  if(!changed) showTraitScopeFeedback('optimizeUtility','보유 재화가 부족하거나 이미 최대입니다');
  return changed>0;
}
function isUtilityClearTrait(t){
  if(!Array.isArray(t) || t[0]===116) return false;
  // 엑셀의 유틸 초기화 범위: SP의 AP/경험치/각성석과 전 재화의 편의·보조 특성.
  return t[3]==='유틸' || (SP_ROWS.has(t[0]) && isUtilitySpTrait(t));
}
function isAttackClearTrait(t){
  return Array.isArray(t) && t[0]!==116 && !isUtilityClearTrait(t);
}
function clearTraitInvestmentsBy(predicate){
  let changed=0;
  TRAITS.forEach(t=>{
    if(!predicate(t)) return;
    const row=+t[0];
    if((INV[row]||0)>0){
      INV[row]=0;
      changed++;
    }
  });
  commitTraitInvestmentChange();
  return changed;
}
function clearUtility(){
  const changed=clearTraitInvestmentsBy(isUtilityClearTrait);
  if(!changed) showTraitScopeFeedback('clearUtility','초기화할 유틸 특성이 없습니다');
  return changed>0;
}
function clearAll(){
  try{
    const changed=clearTraitInvestmentsBy(isAttackClearTrait);
    if(!changed) showTraitScopeFeedback('clearAll','초기화할 공격 특성이 없습니다');
    return changed>0;
  }catch(e){
    rememberAppIssue('error','[clearAll failed]', e);
    alertApp('특성 초기화 실패: '+(e && e.message ? e.message : e));
    return false;
  }
}
/* ── 11 · 화면 설정·승단 ── */
/* 11-A · 글자 크기·화면 설정 */
/* 11-A · 넥서스 공통 글씨 크기 설정 · 메인/독립 창 동기화 */
function getFontScale(){
  const raw=DPS_ROOT.style.getPropertyValue('--app-font-scale');
  const scale=parseFloat(raw);
  return Number.isFinite(scale) ? scale : DPS_CONFIG.ui.fontScaleDefault;
}
function applyFontScale(scale,options={}){
  const next=Math.max(DPS_CONFIG.ui.fontScaleMin,Math.min(DPS_CONFIG.ui.fontScaleMax,Number(scale)||DPS_CONFIG.ui.fontScaleDefault));
  DPS_ROOT.style.setProperty('--app-font-scale',next.toFixed(2));
  if(!options.fromHost){
    try{localStorage.setItem(DPS_CONFIG.storage.fontKey,String(next));}catch(error){rememberAppIssue('warn','글씨 크기 저장',error);}
  }
  return true;
}
function loadFontScale(){
  let scale=DPS_CONFIG.ui.fontScaleDefault;
  try{const saved=parseFloat(localStorage.getItem(DPS_CONFIG.storage.fontKey)||'');if(Number.isFinite(saved))scale=saved;}
  catch(error){rememberAppIssue('warn','글씨 크기 불러오기',error);}
  applyFontScale(scale,{fromHost:true});
}
window.NEXUS_SET_BUILDER_FONT_SCALE=scale=>applyFontScale(scale,{fromHost:true});
window.addEventListener('storage',event=>{if(event.key===DPS_CONFIG.storage.fontKey)loadFontScale();});
window.NEXUS_PREPARE_BUILDER_WINDOW=()=>saveState({silent:true});
/* 11-C · 더제로 승단 행 정의·선택지 생성 */

const ZERO_PENANCE_ROWS=[
  'Practice','Very Easy','Easy','Normal','Hard','Very Hard','Hell','Inferno','Lunatic','Holic','Epic','Ultimate','Impossible','The Final'
].map((name,index)=>({name,row:13+index}));
/* 11-C · 더제로 승단·계산 UI */
function zeroScoreInputHtml(className, options={}){
  const inputMode=options.inputmode || 'numeric';
  const placeholder=options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : '';
  const maxLength=options.maxlength ? ` maxlength="${Number(options.maxlength)}"` : '';
  const label=options.label ? ` aria-label="${escapeHtml(options.label)}"` : '';
  const range=options.range ? ` min="${options.range[0]}" max="${options.range[1]}" step="1"` : '';
  return `<input class="${className}" inputmode="${inputMode}"${maxLength}${placeholder}${label}${range} autocomplete="off" type="${options.range ? 'number' : 'text'}" value="${options.range ? options.range[0] : '0'}"/>`;
}
const ZERO_PENANCE_SELECT_VALUES=Object.freeze([0,7,9,13,16,17,18,19,20]);
function zeroScorePenanceSelectHtml(className, label){
  return `<select class="${className}" aria-label="${escapeHtml(label)}">${ZERO_PENANCE_SELECT_VALUES.map(value=>`<option value="${value}">${value===0?'없음':value}</option>`).join('')}</select>`;
}
function zeroScoreHonorSelectHtml(className, label){
  const options=[['0','없음'],...ZERO_HONOR_STAGES.map(({key})=>[key,key.toUpperCase()])];
  return `<select class="${className}" aria-label="${escapeHtml(label)}">${options.map(([value,name])=>`<option value="${value}">${name}</option>`).join('')}</select>`;
}
function zeroScoreStarButtonHtml(){
  return '<button class="ui-toggle-btn zero-star-toggle" data-action="zeroScoreStar" type="button" aria-pressed="false" aria-label="24스타 미적용">미적용</button>';
}
function buildZeroScoreCalcRow(config){
  const name=escapeHtml(config.name);
  const penance=config.type==='penance';
  const generalCurrent=penance ? zeroScorePenanceSelectHtml('zero-calc-current',`${config.name} 일반 현재`) : zeroScoreInputHtml('zero-calc-current',{label:`${config.name} 일반 현재`});
  const generalTarget=penance ? zeroScorePenanceSelectHtml('zero-calc-target',`${config.name} 일반 목표`) : zeroScoreInputHtml('zero-calc-target',{label:`${config.name} 일반 목표`});
  const honorCurrent=penance ? zeroScoreHonorSelectHtml(config.currentHonorClass,`${config.name} 명예 현재`) : zeroScoreInputHtml(config.currentHonorClass,{...config.honorOptions,label:`${config.name} 명예 현재`});
  const honorTarget=penance ? zeroScoreHonorSelectHtml(config.targetHonorClass,`${config.name} 명예 목표`) : zeroScoreInputHtml(config.targetHonorClass,{...config.honorOptions,label:`${config.name} 명예 목표`});
  const field=(label,control)=>`<label class="zero-calc-field"><span>${label}</span>${control}</label>`;
  const generalLabel=penance?'일반 고행':'도전의 탑';
  const honorLabel=penance?'명예':'명예의탑';
  const starControl=config.star===false
    ? '<span class="zero-calc-unavailable" aria-label="24스타 해당 없음">해당 없음</span>'
    : zeroScoreStarButtonHtml();
  return `<article class="zero-calc-row" data-row-type="${config.type}">
    <div class="zero-calc-row-bar">
      <button class="zero-calc-row-head" type="button" aria-expanded="false" aria-controls="zeroScoreDetails${config.number}" aria-describedby="zeroScoreSummary${config.number}" aria-label="${name} 승단 점수 입력 펼치기">
        <span class="zero-calc-name"><span class="zero-calc-row-symbol" aria-hidden="true">${String(config.number).padStart(2,'0')}</span><strong>${name}</strong></span>
        <span class="zero-calc-inline-labels" aria-hidden="true"><span>구분</span><span>현재</span><span>목표</span><span>목표 추가점수</span></span>
        <span class="zero-calc-head-summary" id="zeroScoreSummary${config.number}" hidden></span>
      </button>
    </div>
    <div class="zero-calc-details" id="zeroScoreDetails${config.number}" hidden>
      <div class="zero-calc-fields">
        <div class="zero-calc-input-row"><span class="zero-calc-kind">${generalLabel}</span>${field('현재',generalCurrent)}${field('목표',generalTarget)}</div>
        <div class="zero-calc-input-row"><span class="zero-calc-kind">${honorLabel}</span>${field('현재',honorCurrent)}${field('목표',honorTarget)}</div>
        <div class="zero-calc-input-footer">
        <div class="zero-calc-metric"><span>24스타</span>${starControl}</div>
        <div class="zero-calc-metric zero-calc-score"><span>목표 추가점수</span><b class="zero-row-score">+0</b></div>
        </div>
      </div>
    </div>
  </article>`;
}
function buildZeroPenanceCalcRow(name,number){
  return buildZeroScoreCalcRow({type:'penance',name,number,currentHonorClass:'zero-current-honor zero-honor-input',targetHonorClass:'zero-target-honor zero-honor-input',honorOptions:{inputmode:'latin',maxlength:2,placeholder:'B'}});
}
function buildZeroTowerCalcRow(){
  return buildZeroScoreCalcRow({type:'towerCombo',name:'도전의 탑',number:ZERO_PENANCE_ROWS.length+1,star:false,currentHonorClass:'zero-tower-honor-current',targetHonorClass:'zero-tower-honor-target'});
}
function renderZeroScoreCalculatorRows(){
  const rows=$('zeroScoreRows');
  if(!rows || rows.dataset.rendered==='1') return;
  rows.innerHTML=ZERO_PENANCE_ROWS.map(({name},index)=>buildZeroPenanceCalcRow(name,index+1)).join('') + buildZeroTowerCalcRow();
  rows.dataset.rendered='1';
}

function getZeroRankTable(){
  return ZERO_RANK_FALLBACK_TABLE;
}
function zeroRankEntry(score){
  const value=Number(score)||0;
  const table=getZeroRankTable();
  return table.reduce((best,item)=>value>=item.score ? item : best, table[0] || ZERO_RANK_FALLBACK_TABLE[0]);
}
/* 11-D · 승단 이름·혜택 미리보기 */
function zeroRankName(score){
  return zeroRankEntry(score)?.name || '입문';
}
function updateZeroRankHighlights(currentRank, targetRank){
  const current=dataText(currentRank);
  const target=dataText(targetRank);
  const card=qs('.zero-rank-result-card');
  if(card){
    card.classList.toggle('zero-rank-same', !!current && current===target);
    card.classList.toggle('zero-rank-upgrade', !!current && !!target && current!==target);
    // 최종 승단에 현재·목표가 모두 도달한 경우 같은 이름을 두 번 표시하지 않습니다.
    card.classList.toggle('zero-rank-final', current===getZeroRankTable().at(-1)?.name && target===current);
  }
}
// 혜택 미리보기는 조회 상태만 별도로 보관합니다. 승단 점수와 프리셋은 변경하지 않습니다.
let zeroBenefitActualIndex=0;
let zeroBenefitViewIndex=null;
function renderZeroBenefitsPreview(){
  const table=getZeroRankTable();
  if(!table.length) return;
  const current=Math.max(0,Math.min(table.length-1,zeroBenefitActualIndex));
  const index=Math.max(0,Math.min(table.length-1,zeroBenefitViewIndex ?? current));
  const entry=table[index];
  const items=$('zeroCurrentBenefitsItems');
  const prev=$('zeroBenefitsPrev');
  const next=$('zeroBenefitsNext');
  setText('zeroCurrentBenefitsTitle',`더제로 ${entry.name} 혜택`);
  setText('zeroBenefitsViewLabel',index===current?'현재 타이틀':'단계 미리보기');
  setText('zeroBenefitsPosition',`${index+1} / ${table.length}`);
  if(prev) prev.disabled=index===0;
  if(next) next.disabled=index===table.length-1;
  if(items){
    const benefits=entry.benefits||[];
    const benefitsKey=JSON.stringify(benefits);
    if(items._benefitsKey===benefitsKey) return;
    items._benefitsKey=benefitsKey;
    // Column-major reading order: for 10 benefits, left 1~6 and right 7~10.
    // Longer tiers distribute the overflow to avoid unnecessarily tall columns.
    const rows=benefits.length<=6 ? Math.ceil(benefits.length/2) : Math.max(6,Math.ceil(benefits.length/2));
    items.style.setProperty('--benefits-rows',String(Math.max(1,rows)));
    items.replaceChildren(...benefits.map((text,index)=>{
      const row=document.createElement('span');
      const number=document.createElement('span');
      number.className='zero-benefit-index';
      number.textContent=String(index+1).padStart(2,'0');
      number.setAttribute('aria-hidden','true');
      const description=document.createElement('span');
      description.className='zero-benefit-description';
      description.textContent=text;
      row.append(number,description);
      return row;
    }));
  }
}
function stepZeroBenefitsPreview(direction){
  const table=getZeroRankTable();
  const current=zeroBenefitViewIndex ?? zeroBenefitActualIndex;
  zeroBenefitViewIndex=Math.max(0,Math.min(table.length-1,current+direction));
  renderZeroBenefitsPreview();
}
/* 11-E · 승단 점수·접힌 행 요약 갱신 */
function updateZeroScoreCalculator(){
  const calc=qs('.zero-score-calc');
  const state=collectZeroScoreState();
  if(!calc || !state) return;
  let currentTotal=0, total=0;
  calc.querySelectorAll('#zeroScoreRows > .zero-calc-row').forEach((row,index)=>{
    const result=zeroScoreRowCalculation(state.rows[index]);
    currentTotal+=result.currentScore;
    total+=result.score;
    const out=row.querySelector('.zero-row-score');
    if(out){
      if(out.textContent!==`+${fullNumber(result.score)}`) out.textContent=`+${fullNumber(result.score)}`;
      out.classList.toggle('is-pending',result.score>0);
    }
    const summary=row.querySelector('.zero-calc-head-summary');
    if(summary){
      const saved=state.rows[index];
      const tower=saved.type==='towerCombo';
      const progressRows=[];
      let achievedCount=0;
      const normalResult=zeroScorePair(saved,tower?zeroTowerScore:zeroPenanceScore);
      const honorResult=tower
        ? zeroScorePair(saved,zeroHonorTowerScore,'towerHonor')
        : zeroScorePair({current:saved.currentHonor,target:saved.targetHonor},zeroHonorScore);
      const progress=(label,current,target,score,format=value=>Number(value)>0?fullNumber(Number(value)):'')=>{
        const cells=[label,format(current),format(target)].map(value=>escapeHtml(value));
        if(!cells[1] && !cells[2]) return;
        const achieved=cells[1]===cells[2];
        if(achieved) achievedCount++;
        const scoreText=achieved?'✓ 달성':`+${fullNumber(score)}`;
        const scoreClass=achieved?' zero-progress-achieved':score>0?' is-pending':'';
        progressRows.push(`<span class="zero-progress-kind">${cells[0]}</span><b aria-label="${cells[0]} 현재 ${cells[1]||'미입력'}">${cells[1]}</b><b aria-label="${cells[0]} 목표 ${cells[2]||'미입력'}">${cells[2]}</b><b class="zero-progress-score${scoreClass}" aria-label="${cells[0]} ${achieved?'목표 달성':`목표 추가점수 +${fullNumber(score)}`}">${scoreText}</b>`);
      };
      progress(tower?'일반탑':'일반',saved.current,saved.target,normalResult.score);
      if(tower){
        progress('명예탑',saved.honorCurrent,saved.honorTarget,honorResult.score);
      }else{
        progress('명예',saved.currentHonor,saved.targetHonor,honorResult.score,value=>value==='0'?'':String(value).toUpperCase());
      }
      const progressTable=progressRows.length
        ? `<span class="zero-calc-progress">${progressRows.join('')}</span>`
        : '';
      summary.hidden=!progressRows.length;
      row.classList.toggle('is-complete',achievedCount===2);
      setHTMLIfChanged(summary,achievedCount===2
        ? '<span class="zero-calc-complete"><span class="zero-calc-all-achieved">✓ 목표 달성</span></span>'
        : progressTable);
    }
  });
  const targetScore=currentTotal+total;
  const currentRank=zeroRankName(currentTotal);
  const targetRank=zeroRankName(targetScore);
  const values=[
    ['.zero-current-score',currentTotal],
    ['.zero-total-add',`+${fullNumber(total)}`],
    ['.zero-target-score',targetScore],
    ['.zero-current-rank',currentRank],
    ['.zero-target-rank',targetRank]
  ];
  values.forEach(([selector,value])=>{
    const element=calc.querySelector(selector);
    if(element && element.textContent!==String(value)) element.textContent=String(value);
  });
  updateZeroRankHighlights(currentRank,targetRank);
  zeroBenefitActualIndex=getZeroRankTable().indexOf(zeroRankEntry(currentTotal));
  renderZeroBenefitsPreview();
}
/* 11-F · 승단 입력 필드·상태 수집·복원 */
const ZERO_SCORE_DOM_FIELDS=Object.freeze({
  current:{selector:'.zero-calc-current',fallback:'0'},
  target:{selector:'.zero-calc-target',fallback:'0'},
  currentHonor:{selector:'.zero-current-honor',fallback:'0',normalize:value=>normalizeZeroHonorValue(value)},
  targetHonor:{selector:'.zero-target-honor',fallback:'0',normalize:value=>normalizeZeroHonorValue(value)},
  honorCurrent:{selector:'.zero-tower-honor-current',fallback:'0'},
  honorTarget:{selector:'.zero-tower-honor-target',fallback:'0'}
});
function zeroScoreDomField(row, key){
  const def=ZERO_SCORE_DOM_FIELDS[key];
  return def ? row.querySelector(def.selector) : null;
}
function readZeroScoreDomField(row, key){
  const def=ZERO_SCORE_DOM_FIELDS[key];
  const value=zeroScoreDomField(row,key)?.value ?? def?.fallback ?? '0';
  return def?.normalize ? def.normalize(value) : value;
}
function writeZeroScoreDomField(row, key, value){
  const def=ZERO_SCORE_DOM_FIELDS[key];
  const field=zeroScoreDomField(row,key);
  if(!field) return;
  if(row.dataset.rowType==='penance' && (key==='current' || key==='target')){
    const numeric=Math.max(0,Math.min(20,Math.trunc(Number(value) || 0)));
    // Keep previously saved levels readable without adding them to the new choice list.
    field.querySelector('option[data-legacy-penance]')?.remove();
    if(!ZERO_PENANCE_SELECT_VALUES.includes(numeric)){
      const legacy=document.createElement('option');
      legacy.value=String(numeric);
      legacy.textContent=String(numeric);
      legacy.hidden=true;
      legacy.dataset.legacyPenance='1';
      field.appendChild(legacy);
    }
    field.value=String(numeric);
    return;
  }
  field.value=def?.normalize ? def.normalize(value ?? def.fallback) : String(value ?? def?.fallback ?? '0');
}
function collectZeroScoreState(){
  const calc=qs('.zero-score-calc');
  if(!calc) return null;
  return {
    rows:Array.from(calc.querySelectorAll('#zeroScoreRows > .zero-calc-row')).map(row=>{
      const type=row.dataset.rowType || 'penance';
      const state={
        type,
        current:readZeroScoreDomField(row,'current'),
        target:readZeroScoreDomField(row,'target'),
        star:type==='penance' && !!row.querySelector('.zero-star-toggle.active'),
        currentHonor:readZeroScoreDomField(row,'currentHonor').toLowerCase(),
        targetHonor:readZeroScoreDomField(row,'targetHonor').toLowerCase()
      };
      if(type==='towerCombo'){
        state.honorCurrent=readZeroScoreDomField(row,'honorCurrent');
        state.honorTarget=readZeroScoreDomField(row,'honorTarget');
      }
      return state;
    })
  };
}
function setZeroScoreStarButton(starBtn,active){
  setTogglePressed(starBtn, active, {activeText:'적용', inactiveText:'미적용'});
  if(starBtn) starBtn.setAttribute('aria-label',active?'24스타 적용중':'24스타 미적용');
}
function applyZeroScoreState(zeroScore){
  const calc=qs('.zero-score-calc');
  if(!calc) return;
  const rows=zeroScore ? normalizeZeroScoreState(zeroScore).rows : [];
  calc.querySelectorAll('#zeroScoreRows > .zero-calc-row').forEach((row,idx)=>{
    const type=row.dataset.rowType || 'penance';
    const saved=type==='towerCombo' ? zeroTowerComboFromRows(rows,idx) : (rows[idx] || {});
    ['current','target','currentHonor','targetHonor','honorCurrent','honorTarget'].forEach(key=>writeZeroScoreDomField(row,key,saved[key]));
    setZeroScoreStarButton(row.querySelector('.zero-star-toggle:not(:disabled)'), !!saved.star);
  });
  updateZeroScoreCalculator();
}
function commitZeroScoreChange(){
  updateZeroScoreCalculator();
  if(!isStorageLocked()) scheduleAutoSave();
}
function toggleZeroScoreStar(trigger){
  if(!trigger) return;
  setZeroScoreStarButton(trigger,!trigger.classList.contains('active'));
  commitZeroScoreChange();
}
function normalizeZeroHonorInputElement(el){
  if(!el || !el.classList?.contains('zero-honor-input') || el.tagName==='SELECT') return;
  el.value=normalizeZeroHonorValue(el.value).toUpperCase();
}
function setZeroScoreRowExpanded(header,expanded,exclusive=true){
  const row=header?.closest('.zero-calc-row');
  const details=row?.querySelector('.zero-calc-details');
  if(!details) return;
  if(expanded && exclusive){
    qs('.zero-rank-card')?.querySelectorAll('.zero-calc-row-head[aria-expanded="true"]').forEach(other=>{
      if(other!==header) setZeroScoreRowExpanded(other,false);
    });
  }
  header.setAttribute('aria-expanded',String(expanded));
  row.classList.toggle('is-expanded',expanded);
  const label=`${header.querySelector('.zero-calc-name strong')?.textContent || '승단'} 승단 점수 입력`;
  header.setAttribute('aria-label',`${label} ${expanded?'접기':'펼치기'}`);
  setAccordionContentExpanded(details,expanded);
}
/* 11-G · 승단 UI 이벤트 연결 */
function bindZeroScoreCalculator(){
  if(DPS_ROOT.dataset.zeroScoreCalcBound==='1') return;
  DPS_ROOT.dataset.zeroScoreCalcBound='1';
  const card=qs('.zero-rank-card');
  const benefitsHelp=$('zeroTitleBenefitsPopover');
  benefitsHelp?.addEventListener('click',event=>{
    const control=event.target.closest('[data-zero-benefits-step]');
    if(!control || control.disabled) return;
    event.preventDefault();
    stepZeroBenefitsPreview(Number(control.dataset.zeroBenefitsStep));
  });
  card?.addEventListener('click',event=>{
    const guideToggle=event.target.closest('[data-zero-guide-toggle]');
    const guideClose=event.target.closest('[data-zero-guide-close]');
    if(guideToggle || guideClose){
      const guide=$('zeroRankGuide');
      const toggle=guide?.querySelector('[data-zero-guide-toggle]');
      const content=$('zeroGuideContent');
      if(!guide || !toggle || !content) return;
      const expanded=!!guideToggle && toggle.getAttribute('aria-expanded')!=='true';
      guide.classList.toggle('is-expanded',expanded);
      toggle.setAttribute('aria-expanded',String(expanded));
      content.hidden=!expanded;
      if(guideClose) toggle.focus({preventScroll:true});
      return;
    }
    const header=event.target.closest('.zero-calc-row-head');
    if(!header || !card.contains(header)) return;
    setZeroScoreRowExpanded(header,header.getAttribute('aria-expanded')!=='true');
    // 마우스/터치 클릭 후 포커스 강조가 접힌 제목에 남지 않도록 정리합니다.
    // 키보드 클릭(detail=0)은 포커스를 유지해 접근성을 보존합니다.
    if(event.detail>0) header.blur();
  });
  const updateAndSave=(target,finalize=false)=>{
    if(!(target && target.closest && target.closest('.zero-score-calc'))) return;
    const penanceRow=target.closest('.zero-calc-row[data-row-type="penance"]');
    if(penanceRow && target.matches('.zero-calc-current,.zero-calc-target')){
      if(target.value===''){
        if(!finalize) return; // Allow replacing a number without saving an empty value.
        target.value='0';
      }
      const value=Number(target.value);
      target.value=String(Number.isFinite(value) ? Math.max(0,Math.min(20,Math.trunc(value))) : 0);
    }
    normalizeZeroHonorInputElement(target);
    commitZeroScoreChange();
  };
  DPS_BODY.addEventListener('input', e=>updateAndSave(e.target), true);
  DPS_BODY.addEventListener('change', e=>updateAndSave(e.target,true), true);
  DPS_BODY.addEventListener('focusout', e=>{
    const target=e.target;
    if(target?.matches?.('.zero-calc-row[data-row-type="penance"] .zero-calc-current,.zero-calc-row[data-row-type="penance"] .zero-calc-target') && target.value==='') updateAndSave(target,true);
  }, true);
}

/* ── 12 · 화면 이벤트 및 연결 ── */
let appEventsBound=false;
const ACTION_HANDLERS={
  toggleTraitExpansionMode:()=>toggleTraitExpansionMode(),
  copyDpsClearRecord,
  optimizeSP,
  optimizeUtility,
  clearUtility:trigger=>requestConfirmAction('clearUtility','한 번 더 누르면 유틸 초기화',clearUtility,trigger),
  clearAll:trigger=>requestConfirmAction('clearAll','한 번 더 누르면 편의/보조 제외 공격 특성 초기화',clearAll,trigger),
  saveTraitPreset:(...args)=>window.DpsPreset.saveCurrent(...args),
  loadTraitPreset:(...args)=>window.DpsPreset.loadSelected(...args),
  updateTraitPreset:(...args)=>window.DpsPreset.updateCurrent(...args),
  deleteTraitPreset:(...args)=>window.DpsPreset.deleteCurrent(...args),
  resetAllTraitPresetState:(...args)=>window.DpsPreset.resetAll(...args),
  backupTraitPresets:(...args)=>window.DpsPreset.openBackup(...args),
  importTraitPresets:(...args)=>window.DpsPreset.openImport(...args),
  zeroScoreStar:(trigger)=>toggleZeroScoreStar(trigger),
  selectButton:(trigger)=>setSelectButton(trigger.closest('.seg-btns')?.dataset.target, trigger.dataset.value),
  donationBuff:(trigger)=>setDonationBuffType(trigger.dataset.value),
  traitAdjust:(trigger)=>{
    if(Date.now()<traitHoldSuppressClickUntil) return false;
    return adjustTraitBy(+trigger.dataset.row,+trigger.dataset.delta,1);
  },
  traitMax:(trigger)=>adjMax(+trigger.dataset.row),
  traitQuickAdjust:(trigger)=>adjustTraitBy(+trigger.dataset.row,1,+trigger.dataset.step),
  toggleTraitTier:(trigger)=>{ const tier=trigger.dataset.tier||''; setTraitTierExpanded(tier,!expandedTraitTiers.has(tier)); },
  masterTier:(trigger)=>masterTier(trigger.dataset.tier||''),
  resetTier:(trigger)=>{ const tier=trigger.dataset.tier||''; return requestConfirmAction(`resetTier:${tier}`, `한 번 더 누르면 ${tier} 초기화`, ()=>resetTier(tier),trigger); }
};
/* 12-A · 사용자 조작 이벤트 */
function bindActionEvents(){
  DPS_BODY.addEventListener('click', e=>{
    const trigger=e.target.closest('[data-action]');
    if(!trigger) return;
    const action=trigger.getAttribute('data-action');
    const fn=ACTION_HANDLERS[action];
    if(!fn) return;
    e.preventDefault();
    fn(trigger, e);
  });
}
const REACTIVE_INPUT_EXCLUDED_IDS=new Set([
  'traitPresetName',
  'traitPresetSelect',
  'traitPresetImportFile',
  'traitPresetBackupName',
  'artifactDpsViewToggle'
]);
const RUNE_CHOICE_SYNC_IDS=new Set(['runeChoiceType','runeChoiceValue']);
const DEDICATED_DPS_BASE_UNIT_REACTIVE_SELECTOR=[
  '[data-dps-base-unit-slot]',
  '[data-dps-jewel-field]',
  '[data-dps-base-unit-extra-limit-break]',
  '[data-dps-base-unit-extra-jewel]',
  '[data-dps-base-unit-slot-jewel]',
  '[data-dps-base-unit-slot-limit-break]'
].join(',');
/* 12-B · 반응형 입력·상태 이벤트 */
function shouldHandleReactiveInput(target){
  if(isStorageLocked()) return false;
  if(!target || !target.id) return false;
  if(REACTIVE_INPUT_EXCLUDED_IDS.has(target.id)) return false;
  if(target.matches?.('[data-dps-base-unit-slot-enhance]')) return false;
  if(target.matches?.(DEDICATED_DPS_BASE_UNIT_REACTIVE_SELECTOR)) return false;
  if(target.classList && target.classList.contains('tv-input')) return false;
  return target.matches && target.matches('input, select, textarea');
}
function bindReactiveInputs(){
  DPS_BODY.addEventListener('click',event=>{
    const teamButton=event.target?.closest?.('[data-team-count]');
    if(teamButton){
      if(teamButton.disabled) return;
      const team=$('team');
      if(team && [...team.options].some(option=>option.value===teamButton.dataset.teamCount) && team.value!==teamButton.dataset.teamCount){
        team.value=teamButton.dataset.teamCount;
        team.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return;
    }
    const button=event.target?.closest?.('[data-mode-choice]');
    if(!button || button.disabled) return;
    event.preventDefault();
    if(button.dataset.modeChoice==='battle'){
      const coop=$('coopMode');
      if(!coop || coop.value===(button.dataset.value==='coop'?'ON':'OFF')) return;
      if(coop.value==='OFF' && $('team')) $('team').dataset.personalTeamValue=vs('team');
      coop.value=button.dataset.value==='coop' ? 'ON' : 'OFF';
      coop.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(button.dataset.modeChoice==='sp-bank'){
      const bank=$('spBankApply');
      if(!bank || bank.value===button.dataset.value) return;
      bank.value=button.dataset.value;
      bank.dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
  let raf=0;
  const schedule=target=>{
    if(!shouldHandleReactiveInput(target)) return;
    if(target.matches('.money-input')) formatMoneyInput(target);
    if(target.id==='spBankApply') syncSpBankApplyControl();
    if(target.id==='xp') normalizeXpInput();
    if(target.id==='round' || target.id==='skillRound' || target.id==='challengeTowerFloor' || target.id==='planetExplorationFloor') normalizeRoundInput(target.id);
    if(target.id==='skillMode') normalizeRoundInput('skillRound');
    if(target.id==='diff'){
      resetDifficultyDependentFields();
      syncArtifactDpsViewSwitch();
      syncErosionControlElements();
      syncPlanetExplorationRestrictedControls();
      renderDpsSanctuaryInfo();
    }
    if(RUNE_CHOICE_SYNC_IDS.has(target.id) || target.id==='rCD') syncRuneChoice();
    if(ENCHANT_INPUT_ID_SET.has(target.id)) syncEnchantInputs();
    if(RUNE_OPTION_SELECT_ID_SET.has(target.id)) syncExclusiveRuneOptions();
    if(target.id==='soloMode' || target.id==='coopMode'){
      syncBattleMode(target.id,{defaultCoop:true});
    }
    if(target?.matches?.('[data-dps-base-unit-quantity-store],[data-dps-base-unit-slot-quantity]')){
      normalizeDpsBaseUnitQuantityInput(target);
      syncDpsBaseUnitSelectionFromQuantities(false);
    }
    if(target.id==='team'){
      syncTeamSelect({preserveCurrent:true});
    }
    if(TRAIT_LIMIT_INPUT_IDS.has(target.id) && String(target.value).replace(/,/g,'').trim()==='0') syncTraitLimitInputDisplay(target);
    if(target.id==='donationBuffType'){ INV[116]=donationInvestmentFromType(target.value); syncDonationBuffControl(); }
    if(target.matches('select')) syncSelectButtons();
    if(target.matches('.buff-choice-input')){
      if(DPS_UNIT_LINKED_BUFF_UNITS[target.id]) updateDpsUnitFromLinkedBuff(target);
      syncBuffChoiceButtons();
    }
    if(raf) return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      commitAppUpdate();
    });
  };
  DPS_BODY.addEventListener('input', e=>{ if(!e.isComposing) schedule(e.target); }, true);
  DPS_BODY.addEventListener('change', e=>schedule(e.target), true);
}
function bindButtonPressFeedback(){
  const selector='button,.btn';
  DPS_BODY.addEventListener('pointerdown', e=>{
    const btn=e.target && e.target.closest ? e.target.closest(selector) : null;
    if(!btn || btn.disabled || btn.classList.contains('ui-reset-btn')) return;
    btn.classList.add('is-pressed');
    setTimeout(()=>btn.classList.remove('is-pressed'), 180);
  }, true);
}
/* 월 전환 시 열린 화면·저장 상태까지 현재 행성 테마로 갱신한다. */
/* 12-C · 행성탐사 날짜·화면 이벤트 */
function bindPlanetExplorationCalendar(){
  let syncedDifficulty=currentPlanetExplorationDifficulty();
  const checkMonth=()=>{
    const current=currentPlanetExplorationDifficulty();
    if(current===syncedDifficulty) return;
    syncedDifficulty=current;
    const active=isPlanetExplorationDifficulty();
    syncDifficultyOptions();
    if(active){
      syncDifficultyTargetControls();
      syncPlanetExplorationRestrictedControls();
    }
    commitAppUpdate({save:false});
  };
  window.setInterval(checkMonth,30000);
  window.addEventListener('focus',checkMonth);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) checkMonth();});
}
function bindAppEvents(){
  if(appEventsBound) return;
  appEventsBound=true;
  [
    bindActionEvents, bindTraitHoldEvents, bindTraitInputEvents,
    bindIntegratedTabEvents, ()=>window.DpsPreset.bindEvents(), bindJewelImageEvents,
    bindZeroScoreCalculator, bindTraitLimitDisplayEvents, bindTraitLimitChoiceEvents, bindAdditionalRuneEvents, bindDpsBaseUnitControlEvents, bindDpsSanctuaryEvents, bindReactiveInputs,
    bindButtonPressFeedback, bindDamageBoardTabEvents, bindDpsCompareEvents, bindDamageBoardSwitchEvents, bindPlanetExplorationCalendar
  ].forEach(fn=>fn());
}
/* ── 13 · 선택 목록 UI 및 동기화 ── */
// 일반 select는 계산·저장 이벤트의 원본으로 유지하고, 표시와 조작만 앱 내부 목록으로 대체합니다.
function initAppSelectDropdowns(){
  if(window.__dpsAppSelectDropdownsReady) return;
  window.__dpsAppSelectDropdownsReady=true;
  const nativeSelector='select:not([data-preview-board]):not(#bp-version):not(#traitPresetSelect):not(#traitPresetImportSharedSource):not(.hidden-field):not(.trait-limit-source):not(.trait-preset-native-select):not([hidden]):not([aria-hidden="true"])';
  const triggerClass='app-select-trigger';
  const menu=document.createElement('div');
  menu.className='app-select-menu';
  menu.id='appSelectMenu';
  menu.setAttribute('role','listbox');
  menu.setAttribute('aria-label','선택 항목');
  menu.hidden=true;
  DPS_BODY.appendChild(menu);
  let activeSelect=null;
  let activeButton=null;
  let scheduled=false;
  const buttons=new Map();
  const isSupported=select=>select?.matches?.(nativeSelector) && !select.closest('[data-trait-preset-custom-select]');
  const label=select=>select.getAttribute('aria-label') || (select.id ? DPS_BODY.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent.trim() : '') || select.closest('label')?.querySelector('span')?.textContent.trim() || '항목 선택';
  function syncButton(select,button){
    if(!select.isConnected || !button.isConnected) return;
    const option=select.selectedOptions?.[0];
    const value=option?.textContent.trim() || '선택 안함';
    const valueNode=button.querySelector('.app-select-button-value');
    if(valueNode.textContent!==value) valueNode.textContent=value;
    // 옵션 배열 전체를 만들지 않고 실제 선택 가능 항목을 찾는 즉시 중단한다.
    let hasSelectableOption=false;
    if(!select.disabled){
      for(const item of select.options){
        if(!item.hidden && !item.parentElement?.hidden && !item.disabled && !item.parentElement?.disabled){
          hasSelectableOption=true;
          break;
        }
      }
    }
    const disabled=!hasSelectableOption;
    if(button.disabled!==disabled) button.disabled=disabled;
    const accessibleName=`${label(select)}: ${value}`;
    if(button.getAttribute('aria-label')!==accessibleName) button.setAttribute('aria-label',accessibleName);
    if(activeSelect===select && (button.disabled || button.hidden)) closeMenu();
  }
  function enhance(select){
    if(!isSupported(select)) return;
    let button=buttons.get(select);
    if(button?.isConnected && button.previousElementSibling===select){ syncButton(select,button); return; }
    const computed=window.getComputedStyle(select);
    if(computed.display==='none' || computed.visibility==='hidden') return;
    button=document.createElement('button');
    button.type='button';
    button.className=triggerClass;
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','appSelectMenu');
    button.innerHTML='<span class="app-select-button-value"></span><span class="app-select-button-chevron" aria-hidden="true"></span>';
    button.style.setProperty('--app-select-control-height',computed.height);
    button.style.setProperty('--app-select-control-font-size',computed.fontSize);
    button.style.setProperty('--app-select-control-font-family',computed.fontFamily);
    button.style.setProperty('--app-select-control-radius',computed.borderRadius);
    // 원본을 먼저 측정한 뒤 숨겨 기존 입력창의 배치·계산 연결을 유지합니다.
    select.insertAdjacentElement('afterend',button);
    select.classList.add('app-select-native-source');
    select.setAttribute('aria-hidden','true');
    select.tabIndex=-1;
    buttons.set(select,button);
    // 현재 refresh()에서 등록된 항목을 한 번만 동기화한다.
  }
  function closeMenu(restoreFocus=false){
    if(!activeSelect) return;
    const button=activeButton;
    activeSelect=null;
    activeButton=null;
    menu.hidden=true;
    menu.replaceChildren();
    if(button){
      button.classList.remove('is-open');
      button.setAttribute('aria-expanded','false');
      if(restoreFocus && button.isConnected) button.focus({preventScroll:true});
    }
  }
  function placeMenu(){
    if(!activeButton?.isConnected){closeMenu();return;}
    const rect=activeButton.getBoundingClientRect();
    const viewport=window.visualViewport;
    const pane=DPS_ROOT.getBoundingClientRect();
    const contained=!window.DPS_STANDALONE_VIEW;
    const originX=contained ? pane.left : 0, originY=contained ? pane.top : 0;
    const viewTop=Math.max(originY,viewport ? viewport.offsetTop : 0);
    const viewLeft=Math.max(originX,viewport ? viewport.offsetLeft : 0);
    const viewBottom=Math.min(contained ? pane.bottom : window.innerHeight,(viewport ? viewport.offsetTop+viewport.height : window.innerHeight));
    const viewRight=Math.min(contained ? pane.right : window.innerWidth,(viewport ? viewport.offsetLeft+viewport.width : window.innerWidth));
    const viewHeight=Math.max(0,viewBottom-viewTop),viewWidth=Math.max(0,viewRight-viewLeft);
    const padding=8;
    const below=Math.max(0,viewTop+viewHeight-rect.bottom-padding);
    const above=Math.max(0,rect.top-viewTop-padding);
    const openAbove=below<Math.min(190,above) && above>below;
    const room=Math.max(84,(openAbove?above:below)-7);
    const width=Math.min(viewWidth-padding*2,Math.max(rect.width,Math.min(210,viewWidth-padding*2)));
    const left=Math.max(viewLeft+padding,Math.min(rect.left,viewLeft+viewWidth-padding-width));
    menu.style.width=`${Math.round(width)}px`;
    menu.style.maxHeight=`${Math.max(72,Math.min(300,Math.floor(room)))}px`;
    menu.style.left=`${Math.round(left-originX)}px`;
    menu.style.top=openAbove ? 'auto' : `${Math.round(rect.bottom-originY+5)}px`;
    menu.style.bottom=openAbove ? `${Math.round((contained?pane.bottom:window.innerHeight)-rect.top+5)}px` : 'auto';
    menu.classList.toggle('opens-up',openAbove);
  }
  function getItems(){ return [...menu.querySelectorAll('[data-app-select-value]')]; }
  function focusItem(item){ if(item){item.focus({preventScroll:true});item.scrollIntoView({block:'nearest'});} }
  function openMenu(select,button,focusList=false){
    if(!select || select.disabled || !button?.isConnected) return;
    if(activeSelect) closeMenu();
    syncButton(select,button);
    activeSelect=select;
    activeButton=button;
    button.classList.add('is-open');
    button.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-label',label(select));
    menu.replaceChildren();
    [...select.children].forEach(node=>{
      if(node.tagName==='OPTGROUP'){
        if(node.hidden) return;
        const group=document.createElement('div');
        group.className='app-select-group-label';
        group.textContent=node.label;
        menu.appendChild(group);
        [...node.children].forEach(appendOption);
      }else if(node.tagName==='OPTION') appendOption(node);
    });
    function appendOption(option){
      if(option.hidden) return;
      const item=document.createElement('button');
      item.type='button';
      item.className='app-select-option';
      item.dataset.appSelectValue=option.value;
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(select.value===option.value));
      item.disabled=option.disabled || option.parentElement?.disabled || false;
      if(select.value===option.value) item.classList.add('is-selected');
      const title=document.createElement('span');
      title.className='app-select-option-text';
      title.textContent=option.textContent.trim();
      item.append(title);
      menu.appendChild(item);
    }
    menu.hidden=false;
    placeMenu();
    if(focusList){focusItem(getItems().find(item=>item.classList.contains('is-selected')&&!item.disabled) || getItems().find(item=>!item.disabled));}
    else getItems().find(item=>item.classList.contains('is-selected'))?.scrollIntoView({block:'nearest'});
  }
  function selectItem(item){
    if(!activeSelect || !item || item.disabled) return;
    const select=activeSelect;
    const button=activeButton;
    const changed=select.value!==item.dataset.appSelectValue;
    select.value=item.dataset.appSelectValue;
    closeMenu(true);
    syncButton(select,button);
    if(changed){
      // 기존 코드가 사용하는 네이티브 change 경로를 반드시 한 번만 실행합니다.
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    requestSync();
  }
  function refresh(){
    scheduled=false;
    // 기존 버튼은 아래 등록 목록에서 동기화하므로 중복 검사하지 않는다.
    DPS_BODY.querySelectorAll(nativeSelector).forEach(select=>{
      if(!select.classList.contains('app-select-native-source')) enhance(select);
    });
    for(const [select,button] of buttons){
      if(select.isConnected && button.isConnected) syncButton(select,button);
      if(!select.isConnected || !button.isConnected){
        if(select===activeSelect) closeMenu();
        buttons.delete(select);
      }
    }
  }
  function requestSync(){
    if(scheduled) return;
    scheduled=true;
    window.requestAnimationFrame(refresh);
  }
  DPS_BODY.addEventListener('click',event=>{
    const option=event.target.closest?.('.app-select-option');
    if(option?.closest('.app-select-menu')){selectItem(option);return;}
    const trigger=event.target.closest?.(`.${triggerClass}`);
    if(trigger){
      const select=trigger.previousElementSibling;
      if(activeButton===trigger) closeMenu();
      else openMenu(select,trigger);
      return;
    }
    const targetLabel=event.target.closest?.('label[for]');
    if(targetLabel){
      const select=DPS_BODY.querySelector('#'+CSS.escape(targetLabel.htmlFor));
      const button=buttons.get(select);
      if(button && !targetLabel.contains(button)){
        event.preventDefault();
        if(activeButton===button) closeMenu();
        else openMenu(select,button);
        return;
      }
    }
    if(activeSelect && !menu.contains(event.target)) closeMenu();
    requestSync();
  });
  // 에디설정 모달이 열린 상태에서는 메뉴와 모달을 Escape 한 번에 닫습니다.
  // 다른 화면에서는 기존 커스텀 Select의 Escape 동작을 유지합니다.
  window.addEventListener('keydown',event=>{
    if(DPS_ROOT.hidden || !DPS_BODY.contains(event.target) || event.key!=='Escape') return;
    if(!$('additionalRuneModal')?.hidden){
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      closeAdditionalRuneModal();
      return;
    }
    if(activeSelect){
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  },true);
  DPS_BODY.addEventListener('keydown',event=>{
    const trigger=event.target.closest?.(`.${triggerClass}`);
    if(trigger && ['ArrowDown','ArrowUp','Home','End',' '].includes(event.key)){
      event.preventDefault();
      if(activeButton!==trigger) openMenu(trigger.previousElementSibling,trigger,true);
      return;
    }
    if(!activeSelect) return;
    if(event.key==='Escape'){
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if(!menu.contains(event.target)) return;
    const items=getItems().filter(item=>!item.disabled);
    const index=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      let next=index;
      if(event.key==='Home') next=0;
      else if(event.key==='End') next=items.length-1;
      else if(event.key==='ArrowDown') next=(index+1)%items.length;
      else next=(index-1+items.length)%items.length;
      focusItem(items[next]);
    }
    if(event.key==='Tab') closeMenu();
  });
  DPS_BODY.addEventListener('change',event=>{
    if(event.target.matches?.('select')) requestSync();
  });
  DPS_BODY.addEventListener('input',requestSync);
  DPS_BODY.addEventListener('focusin',event=>{
    if(activeSelect && !menu.contains(event.target) && event.target!==activeButton) closeMenu();
  });
  const observer=new MutationObserver(records=>{
    if(records.some(record=>{
      if(record.type==='attributes') return record.target.matches?.('select,option,optgroup');
      if(record.target.matches?.('select,optgroup')) return true;
      return [...record.addedNodes].some(node=>node.nodeType===1 && (node.matches?.('select') || node.querySelector?.('select')));
    })) requestSync();
  });
  observer.observe(DPS_BODY,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','selected','value']});
  window.addEventListener('resize',()=>{ if(activeSelect) placeMenu();requestSync(); },{passive:true});
  window.addEventListener('scroll',event=>{if(activeSelect && !menu.contains(event.target)) closeMenu();},{passive:true,capture:true});
  window.visualViewport?.addEventListener('resize',()=>{if(activeSelect) placeMenu();},{passive:true});
  // 프리셋 로드 등 직접 .value를 변경하는 기존 코드와 화면 표시를 동기화합니다.
  window.addEventListener('dps:preset-loaded',requestSync);
  refresh();
}

/* ── 14 · 앱 초기화 및 준비 상태 ── */
function initApp(){
  loadFontScale();
  // 기본 상태 수집에 필요한 입력 행과 이벤트만 먼저 준비한다.
  // loadState()의 상태 적용·recalc()에서 컨트롤/계산 화면을 한 번에 동기화한다.
  renderZeroScoreCalculatorRows();
  bindAppEvents();
  // 유닛별 저장 필드는 복원 전에 준비해야 강화·한계 돌파·쥬얼 값이 유지된다.
  // 화면 전체 재동기화 없이 필수 저장 입력만 생성하여 초기 최적화를 보존한다.
  ensureDpsBaseUnitStore();
  loadState();
  // 저장값이 적용된 상태에서 성소 입력 UI를 최초 생성한다.
  renderDpsSanctuaryInfo();
  window.DpsPreset.init();
  initAppSelectDropdowns();
}
function markAppReady(){
  try{
    if(typeof window.dpsSyncResponsiveLayout === 'function') window.dpsSyncResponsiveLayout();
  }catch(error){ rememberAppIssue('warn','반응형 레이아웃 동기화', error); }
  if(typeof window.dpsMarkAppReady==='function'){
    window.dpsMarkAppReady();
    return;
  }
  DPS_ROOT.classList.remove('dps-booting');
  try{
    const boot=$('dpsBootScreen');
    if(boot) boot.setAttribute('aria-hidden','true');
  }catch(error){ rememberAppIssue('warn','부팅 화면 숨김', error); }
}
function markAppError(code, error){
  if(typeof window.dpsShowBootError==='function') window.dpsShowBootError(code, error);
  else{
    window.DPS_LAST_INIT_ERROR={code,error,time:Date.now()};
  }
}
window.dpsStartApp=function(){
  if(window.__dpsAppStarted) return;
  window.__dpsAppStarted=true;
  try{
    initApp();
    markAppReady();
  }catch(e){
    markAppError('B1001', e);
  }
};
