/* 클리어 리포트 · 데이터 조회·표시·복사
 * 이벤트 연결은 preset.js의 기존 공통 바인딩을 사용한다.
 */
/* ── 01 · 클리어 리포트 ── */
/* 현재 프리셋의 클리어 리포트: 이전 상세 기록과 동일한 보고서 형식, 로컬 조회·복사 전용 */
function formatDpsClearReport(report){
  const {context,stageMain,stageRound,achievement,specDps,dpsLabel,required,expected,resourceRows,buildRows,effects,units,sanctuaryRows=[]}=report;
  const lines=[
    '클리어 리포트',
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
  // 방어력 관통은 스펙 보드 정보이므로 클리어 리포트에는 중복 출력하지 않는다.
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

let traitClearRecordText='';
let traitClearRecordTrigger=null;
let traitClearRecordCopyTimer=0;
function renderTraitClearRecord(report,{empty=false}={}){
  const container=$('traitClearRecordBody');
  if(!container) return;
  container.replaceChildren();
  container.classList.toggle('is-empty',empty);
  if(empty){
    const message=document.createElement('p');
    message.className='trait-clear-record-empty';
    message.setAttribute('role','status');
    message.textContent=report;
    container.appendChild(message);
    return;
  }
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls) el.className=cls;if(text!=null) el.textContent=text;return el;};
  const section=(number,title)=>{
    const el=make('section','trait-clear-record-section');
    const heading=make('h3','');heading.append(make('span','trait-clear-record-number',number),document.createTextNode(title));el.append(heading);container.append(el);return el;
  };
  const fields=(parent,rows,cls='')=>{
    const list=make('dl',cls);
    for(const {label,value} of rows){const row=make('div','trait-clear-record-row');row.append(make('dt','',label),make('dd','',value));list.append(row);}
    parent.append(list);
  };
  const grid=(parent,rows,cls)=>fields(parent,rows,`trait-clear-record-metrics ${cls}`);
  const table=(parent,headers,rows)=>{
    const el=make('table','trait-clear-record-table'),head=el.createTHead().insertRow(),body=el.createTBody();
    for(const label of headers){const th=make('th','',label);th.scope='col';head.append(th);}
    for(const values of rows){const row=body.insertRow();for(const value of values) row.append(make('td','',value));}
    parent.append(el);
  };
  const {context,stageMain,stageRound,achievement,specDps,dpsLabel,required,expected,resourceRows,buildRows,effects,units,sanctuaryRows}=report;
  const hero=make('div','trait-clear-record-hero');
  hero.append(make('span','trait-clear-record-hero-label','클리어 달성률'),make('strong','trait-clear-record-achievement',achievement));
  grid(hero,[{label:'클리어 기준',value:required},{label:'클리어 기대값',value:expected}],'is-clear');container.append(hero);
  fields(section('01','전투 요약'),[{label:'모드 난이도',value:context},{label:'고행',value:stageMain},{label:'라운드',value:stageRound},{label:dpsLabel,value:specDps}]);
  grid(section('02','재화 현황'),resourceRows,'is-resource');
  const build=section('03','빌드 설정');fields(build,buildRows.filter(row=>row.label!=='인첸트'));
  const enchant=buildRows.find(row=>row.label==='인첸트');
  if(enchant){const row=make('div','trait-clear-record-enchants');row.append(make('span','',enchant.label));const values=make('div','');for(const value of enchant.value.split(' · ')) values.append(make('b','',value));row.append(values);build.append(row);}
  const months=section('04','이달의 룬 효과');
  const monthLines=effects.find(group=>group.title==='이달의 룬 효과')?.lines || [];
  if(monthLines.length) table(months,['적용 월','일반','강화'],monthLines.map(line=>[line.match(/^\d+월/)?.[0]||line,line.match(/일반\s+(\d+)/)?.[1]||'—',line.match(/강화\s+(\d+)/)?.[1]||'—']));
  else months.append(make('p','trait-clear-record-line','없음'));
  for(const [number,title] of [['05','강화 효과'],['06','선택 버프']]){
    const el=section(number,title),lines=effects.find(group=>group.title===title)?.lines || [];
    for(const line of lines.length?lines:['없음']) el.append(make('p',`trait-clear-record-line${title==='강화 효과'&&line!=='없음'?' is-effect':''}`,line));
  }
  const sanctuary=section('07','성소 정보');
  if(sanctuaryRows.length){for(const slot of sanctuaryRows) sanctuary.append(make('p','trait-clear-record-line',`${slot.number} · ${slot.start} ~ ${slot.end} · ${slot.skill1||'—'} · ${slot.count1||'—'} · ${slot.skill2||'—'} · ${slot.count2||'—'}`));}
  else sanctuary.append(make('p','trait-clear-record-line','성소 스킬 사용 없이 클리어됨'));
  const unitSection=section('08',`선택 유닛 정보 (${units.length}슬롯 · ${units.reduce((sum,unit)=>sum+Math.max(1,Number(unit.quantity)||1),0)}마리)`);
  for(const unit of units){
    const card=make('article','trait-clear-record-unit'),head=make('h4','');head.append(make('span','trait-clear-record-slot',unit.slot),make('strong','',unit.name),make('small','',`${unit.quantity}마리 · 강화 ${unit.enhance}`));card.append(head);
    const members=[{number:unit.extras.length?'1기':Number(unit.quantity)>1?'공통':'1기',limitBreak:unit.limitBreak,jewel:unit.jewel},...unit.extras.map(extra=>({...extra,number:`${extra.number}기`}))];
    table(card,['개체','한계 돌파','전설·신화 쥬얼'],members.map(member=>[member.number,member.limitBreak,member.jewel]));unitSection.append(card);
  }
  if(!units.length) unitSection.append(make('p','trait-clear-record-line','없음'));
}
function resetTraitClearRecordCopyButtons(){
  clearTimeout(traitClearRecordCopyTimer);
  DPS_BODY.querySelectorAll('[data-clear-record-copy]').forEach(button=>{
    button.querySelector('span').textContent='리포트 복사';
  });
}
function openTraitClearRecord(){
  const overlay=$('traitClearRecordOverlay');
  const panel=$('traitClearRecordPanel');
  if(!overlay || !panel) return;
  const report=createDpsClearReport();
  traitClearRecordText=(report.plainText || '').replace(/^(\s*)- /gm,'$1');
  traitClearRecordTrigger=document.activeElement;
  resetTraitClearRecordCopyButtons();
  if(traitClearRecordText) renderTraitClearRecord(report.report);
  else{
    renderTraitClearRecord(report.error || '현재 표시할 클리어 리포트가 없습니다.',{empty:true});
  }
  DPS_BODY.querySelectorAll('[data-clear-record-copy]').forEach(button=>{button.disabled=!traitClearRecordText;});
  overlay.hidden=false;
  DPS_BODY.classList.add('trait-clear-record-open');
  panel.focus();
  const body=$('traitClearRecordBody');
  if(body) body.scrollTop=0;
}
function closeTraitClearRecord(){
  const overlay=$('traitClearRecordOverlay');
  if(!overlay || overlay.hidden) return;
  overlay.hidden=true;
  DPS_BODY.classList.remove('trait-clear-record-open');
  traitClearRecordText='';
  resetTraitClearRecordCopyButtons();
  if(traitClearRecordTrigger?.isConnected) traitClearRecordTrigger.focus();
  traitClearRecordTrigger=null;
}
async function copyTraitClearRecord(button){
  if(!traitClearRecordText || !button || button.disabled) return;
  const text=traitClearRecordText;
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
    input.select();
    try{copied=document.execCommand('copy');}catch(error){copied=false;}
    input.remove();
    if(selection?.isConnected) selection.focus();
  }
  if(!$('traitClearRecordOverlay') || $('traitClearRecordOverlay').hidden) return;
  resetTraitClearRecordCopyButtons();
  button.querySelector('span').textContent=copied ? '리포트 복사 완료' : '복사 실패';
  traitClearRecordCopyTimer=setTimeout(resetTraitClearRecordCopyButtons,1600);
}

