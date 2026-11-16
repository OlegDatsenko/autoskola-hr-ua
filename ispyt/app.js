"use strict";
/* Навчальний прототип. Жодних мережевих запитів, аналітики чи сервера. */
(() => {
 const VERSION = 2, TOTAL = 38, PRIORITY = 4, DURATION = 45 * 60 * 1000;
 // A password check in a static website is only a convenience gate, NOT content encryption.
 const KEY_HASH = 'f80b16076dea8e737a19793e1ea33ddce8381a078f64826fa8cd4fb6fc4fa30d';
 const AUTH_SESSION = 'autoskola_hrua_access_v2', OLD_STORE = 'autoskola_hrua_exam_v1';
 let STORE=null, HISTORY_STORE=null, unlocked=false, history={version:1,wrongs:{},processed:[]};
 const $ = id => document.getElementById(id);
 const byId = new Map(EXAM_QUESTIONS.map(q => [q.id, q]));
 const prioritySet = new Set(PRIORITY_IDS);
 // Coordinates of the original light-blue numeric answer blanks, derived from the unchanged PDF page images.
 const NUMERIC_RECTS = {"337":[27.356,41.603,11.111,7.909],"339":[20.307,41.603,11.111,7.909],"341":[20.307,41.603,11.111,7.909],"342":[22.529,76.49,11.111,7.909],"343":[20.307,41.603,11.111,7.909],"344":[20.307,41.603,11.111,7.909],"456":[23.985,41.603,11.188,7.909],"457":[23.985,41.603,11.188,7.909],"458":[23.985,41.603,11.188,7.909],"459":[23.985,41.603,11.188,7.909],"460":[23.985,41.603,11.188,7.909],"466":[27.356,75.731,11.111,7.801],"513":[20.307,41.603,11.111,7.909],"514":[20.307,41.603,11.111,7.909],"551":[20.307,41.603,11.111,7.909],"566":[20.307,41.603,11.111,7.909],"690":[20.307,41.603,11.111,7.909]};
 let state=null, zoomed=false, currentScreen='gate', confirmation=null;
 const safeGet=()=>{try{return STORE?localStorage.getItem(STORE):null}catch{return null}};
 const safeSet=v=>{try{if(STORE)localStorage.setItem(STORE,JSON.stringify(v))}catch{}};
 const readHistory=()=>{
  try{const v=JSON.parse(localStorage.getItem(HISTORY_STORE)||'null');
   if(v?.version===1 && typeof v.wrongs==='object' && v.wrongs && Array.isArray(v.processed))return v;
  }catch{}
  return {version:1,wrongs:{},processed:[]};
 };
 const saveHistory=()=>{try{if(HISTORY_STORE)localStorage.setItem(HISTORY_STORE,JSON.stringify(history))}catch{}};
 const pendingReview=()=>Object.keys(history.wrongs).map(Number).filter(id=>byId.has(id)&&history.wrongs[id]?.needsReview);
 // Prioritize wrong answers, randomly within the same number of previous mistakes.
 const pickReview=(ids,limit)=>shuffled(ids).sort((a,b)=>(history.wrongs[b]?.wrongCount||0)-(history.wrongs[a]?.wrongCount||0)).slice(0,limit);
 async function digest(s){
  if(!globalThis.crypto?.subtle)throw Error('Для перевірки ключа відкрийте сторінку через HTTPS або сучасний браузер.');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
 }
 function lockAccess(){
  try{sessionStorage.removeItem(AUTH_SESSION)}catch{}
  unlocked=false;STORE=null;HISTORY_STORE=null;state=null;history={version:1,wrongs:{},processed:[]};
  $('gate-key').value='';$('gate-error').textContent='';showScreen('gate');$('gate-key').focus();
 }
 function setAccess(hash){
  unlocked=true;STORE='autoskola_hrua_exam_v2_'+hash.slice(0,16);
  HISTORY_STORE='autoskola_hrua_wrong_history_v2_'+hash.slice(0,16);
  history=readHistory();try{sessionStorage.setItem(AUTH_SESSION,hash)}catch{}
  $('gate-key').value='';$('gate-error').textContent='';restore();
 }
 async function unlock(raw){
  const button=$('gate-submit');button.disabled=true;
  try{
   const hash=await digest(raw);
   if(hash!==KEY_HASH){$('gate-error').textContent='Невірне ключове слово.';return}
   setAccess(hash);
  }catch(e){$('gate-error').textContent=e.message||'Не вдалося перевірити ключ.'}
  finally{button.disabled=false}
 }
 const fmtMs=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
 const shuffled=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const activeQ=()=>byId.get(state.ids[state.index]);
 const answerFor=id=>String(state?.answers?.[id]??'');
 const isAnswered=id=>answerFor(id).trim().length>0;
 const normalized=(q,v)=>{
  const s=String(v??'').trim();
  if(q.type==='numeric'){
   // The provided key uses both bare numbers and e.g. 100m; these are equivalent to a bare number entered by the student.
   return s.toLowerCase().replace(/\s+/g,'').replace(/met(a|ar|ara|ri|re|ru|rom|rima)?$/i,'m').replace(/m$/,'').replace(/,/g,'.');
  }
  return q.type==='multi' ? [...new Set(s.toUpperCase().replace(/[^A-D]/g,''))].sort().join('') : s;
 };
 const isCorrect=id=>{const q=byId.get(id);return isAnswered(id) && normalized(q,answerFor(id))===normalized(q,q.key)};
 const score=()=>state.ids.filter(id=>isCorrect(id)).length;
 const answeredCount=()=>state.ids.filter(id=>isAnswered(id)).length;
 const showScreen=name=>{
  if(!unlocked && name!=='gate')name='gate';
  currentScreen=name;
  for(const id of ['gate','home','exam','result']) $(id).hidden=id!==name;
  $('head-stats').hidden=name!=='exam';$('lock-btn').hidden=name==='gate';
  window.scrollTo({top:0,behavior:'auto'});
 };
 function updateHome(){
  const queued=pendingReview().length,all=Object.keys(history.wrongs).length;
  $('history-active').textContent=String(queued);
  $('history-summary').textContent=all===0
   ? 'Після першого екзамену тут з’являться питання, на які ви відповіли неправильно.'
   : `Потрібно повторити: ${queued} із ${all} питань, на яких раніше були помилки. Правильна повторна відповідь прибирає питання з черги, але залишає в історії.`;
  const active=state && !state.finishedAt && state.ids.length===TOTAL;
  $('resume-btn').hidden=!active;
  $('show-last-btn').hidden=!(state && state.finishedAt);
  $('start-btn').textContent=active?'Почати інший екзамен':'Почати новий екзамен';
 }
 function restore(){
  if(!unlocked)return;
  state=null;
  try{
   let raw=safeGet();
   if(!raw){
    // One-time migration from the earlier, unprotected version on the same origin.
    const legacy=localStorage.getItem(OLD_STORE);
    if(legacy){const old=JSON.parse(legacy);
     if(old?.version===1 && Array.isArray(old.ids) && old.ids.length===TOTAL){
      old.version=VERSION;old.examId='legacy_'+old.startedAt;old.reviewIds=[];
      raw=JSON.stringify(old);safeSet(old);
     }
    }
   }
   const s=JSON.parse(raw||'null');
   if(s?.version===VERSION && Array.isArray(s.ids) && s.ids.length===TOTAL && new Set(s.ids).size===TOTAL && s.ids.every(id=>byId.has(id)) && s.answers && typeof s.endAt==='number' && Number.isFinite(s.endAt)){
    state=s;state.index=Math.min(37,Math.max(0,Number(state.index)||0));
    state.reviewIds=Array.isArray(state.reviewIds)?state.reviewIds:[];
    if(!state.finishedAt && Date.now()>=state.endAt)finishExam('time');
    if(state.finishedAt)recordHistory();
   }
  }catch(e){console.warn('Відновлення недоступне',e)}
  updateHome();showScreen('home');
 }
 function startExam(){
  if(!unlocked)return;
  const due=pendingReview(),duePriority=due.filter(id=>prioritySet.has(id)),dueOther=due.filter(id=>!prioritySet.has(id));
  const repeatPriority=pickReview(duePriority,PRIORITY);
  const required=[...repeatPriority,...shuffled(PRIORITY_IDS.filter(id=>!repeatPriority.includes(id))).slice(0,PRIORITY-repeatPriority.length)];
  const repeatOther=pickReview(dueOther,TOTAL-PRIORITY);
  const rest=[...repeatOther,...shuffled(EXAM_QUESTIONS.map(q=>q.id).filter(id=>!prioritySet.has(id) && !repeatOther.includes(id))).slice(0,TOTAL-PRIORITY-repeatOther.length)];
  const ids=shuffled([...required,...rest]);
  const reviewIds=[...repeatPriority,...repeatOther];
  if(ids.length!==TOTAL || new Set(ids).size!==TOTAL || ids.filter(id=>prioritySet.has(id)).length!==PRIORITY)throw Error('Помилка відбору питань');
  const now=Date.now();state={version:VERSION,examId:String(now)+'_'+Math.random().toString(36).slice(2,9),ids,reviewIds,answers:{},index:0,startedAt:now,endAt:now+DURATION,finishedAt:null,reason:null};zoomed=false;safeSet(state);showScreen('exam');renderExam();
 }
 function choose(v){
  if(!state || state.finishedAt || Date.now()>=state.endAt){tick();return}
  const q=activeQ(),id=q.id;
  if(q.type==='multi'){
   const set=new Set(answerFor(id).split('').filter(c=>'ABCD'.includes(c)));
   if(set.has(v))set.delete(v);else set.add(v);
   state.answers[id]=[...set].sort().join('');
  }else if(q.type==='picture')state.answers[id]=v;
  safeSet(state);drawChoices();drawOverlay();drawNav();
 }
 function typeNumber(v,source){
  if(!state||state.finishedAt)return;
  state.answers[activeQ().id]=v;
  for(const el of [$('answer-controls').querySelector('input'),$('overlays').querySelector('input')]){
   if(el && el!==source && el.value!==v)el.value=v;
  }
  safeSet(state);drawNav();
 }
 function drawChoices(){
  const q=activeQ(),wrap=$('answer-controls');wrap.replaceChildren();
  if(q.type==='numeric'){
   const line=document.createElement('div');line.className='number-field';
   const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Числова відповідь');input.value=answerFor(q.id);input.placeholder='Число';input.maxLength=20;
   input.addEventListener('input',()=>typeNumber(input.value,input));
   line.append(input);
   if(q.key.endsWith('m')){const unit=document.createElement('span');unit.className='unit-label';unit.textContent='метри (м)';line.append(unit)}
   wrap.append(line);
   $('answer-note').textContent='введіть число';
  }else{
   $('answer-note').textContent=q.type==='multi'?'можна вибрати декілька варіантів':'виберіть номер зображення';
   for(const k of q.options){const btn=document.createElement('button');btn.type='button';btn.className='choice'+(answerFor(q.id).includes(k)?' selected':'');btn.textContent=k;btn.setAttribute('aria-pressed',answerFor(q.id).includes(k));btn.setAttribute('aria-label','Варіант '+k);btn.addEventListener('click',()=>choose(k));wrap.append(btn)}
  }
 }
 function drawOverlay(){
  const q=activeQ(),layer=$('overlays');layer.replaceChildren();
  if(q.type==='numeric'){
   const r=NUMERIC_RECTS[q.id];
   if(r){
    const input=document.createElement('input');
    input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;input.maxLength=20;
    input.className='over-numeric';input.setAttribute('aria-label','Числова відповідь на сторінці');
    input.value=answerFor(q.id);
    input.style.left=r[0]+'%';input.style.top=r[1]+'%';
    input.style.width=r[2]+'%';input.style.height=r[3]+'%';
    input.addEventListener('input',()=>typeNumber(input.value,input));
    layer.append(input);
   }
   return;
  }
  for(const k of q.options){const pos=q.pos[k];if(!pos)continue;
   const btn=document.createElement('button');btn.type='button';btn.className='over-option'+(answerFor(q.id).includes(k)?' selected':'');btn.style.left=pos[0]+'%';btn.style.top=pos[1]+'%';btn.textContent=answerFor(q.id).includes(k)?'✓':'';btn.setAttribute('aria-label','Вибрати '+k);btn.setAttribute('aria-pressed',answerFor(q.id).includes(k));btn.title='Відповідь '+k;btn.addEventListener('click',()=>choose(k));layer.append(btn);
  }
 }
 function drawNav(){
  $('answered-count').textContent=answeredCount()+' із '+TOTAL+' з відповіддю';const nav=$('question-nav');nav.replaceChildren();
  state.ids.forEach((id,i)=>{
   const b=document.createElement('button');b.type='button';b.className='q-chip'+(isAnswered(id)?' answered':'')+(i===state.index?' current':'');b.textContent=String(i+1);b.setAttribute('aria-label','Питання '+(i+1)+'; оригінал №'+id+(isAnswered(id)?'; відповідь є':''));b.setAttribute('aria-current',i===state.index?'step':'false');b.addEventListener('click',()=>move(i));nav.append(b)
  });
 }
 function renderExam(){
  if(!state || state.finishedAt)return;
  if(Date.now()>=state.endAt){finishExam('time');return}
  const q=activeQ();$('q-progress').textContent='ПИТАННЯ '+(state.index+1)+' ІЗ '+TOTAL;
  $('q-heading').textContent='Питання №'+q.id;
  $('q-type').textContent=q.type==='multi'?'Варіанти A–D':q.type==='picture'?'Вибір зображення 1–3':'Числова відповідь';
  $('priority-label').hidden=!prioritySet.has(q.id);$('review-label').hidden=!state.reviewIds.includes(q.id);
  $('q-image').src='questions/'+String(q.id).padStart(3,'0')+'.webp';
  $('q-image').alt='Оригінальна PDF-сторінка із запитанням №'+q.id;
  $('q-image').onerror=()=>{$('saved-status').textContent='Не вдалося відкрити зображення №'+q.id+'. Перевірте папку questions.'};
  drawChoices();drawOverlay();drawNav();
  $('prev-btn').disabled=state.index===0;$('next-btn').disabled=state.index===TOTAL-1;
  $('next-btn').textContent=state.index===TOTAL-1?'Останнє питання':'Наступне';
  $('saved-status').textContent='Зберігається автоматично';
  $('paper').classList.toggle('zoomed',zoomed);$('zoom-btn').textContent=zoomed?'Вписати сторінку':'Збільшити сторінку';$('zoom-btn').setAttribute('aria-pressed',String(zoomed));
  tick();
 }
 function move(idx){if(!state||state.finishedAt)return;state.index=Math.max(0,Math.min(TOTAL-1,idx));safeSet(state);renderExam();}
 function tick(){if(!state || state.finishedAt)return;const left=state.endAt-Date.now();$('time').textContent=fmtMs(left);$('time').classList.toggle('urgent',left<=5*60*1000);if(left<=0)finishExam('time')}
 function recordHistory(){
  if(!state?.finishedAt || !unlocked)return;
  const examId=String(state.examId||'legacy_'+state.startedAt);
  if(history.processed.includes(examId))return;
  for(const id of state.ids){
   if(!isAnswered(id))continue; // Unanswered is wrong in the report, but is not a wrong answer in the repetition history.
   const old=history.wrongs[id];
   if(isCorrect(id)){
    if(old){old.needsReview=false;old.lastCorrectAt=state.finishedAt;old.correctAfterWrong=(old.correctAfterWrong||0)+1}
   }else{
    history.wrongs[id]={...old,wrongCount:(old?.wrongCount||0)+1,lastWrongAt:state.finishedAt,lastWrongAnswer:answerFor(id),needsReview:true};
   }
  }
  history.processed.push(examId);
  if(history.processed.length>1000)history.processed=history.processed.slice(-1000);
  saveHistory();
 }
 function finishExam(reason){
  if(!state||state.finishedAt)return;
  state.finishedAt=Date.now();state.reason=reason||'manual';safeSet(state);recordHistory();
  if(currentScreen==='exam'){hideConfirm();showScreen('result');renderResult()}
 }
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function renderResult(){
  if(!state?.finishedAt)return;
  showScreen('result');const correct=score(),wrong=TOTAL-correct;
  $('result-correct').textContent=String(correct);$('result-wrong').textContent=String(wrong);$('result-percent').textContent=Math.round(100*correct/TOTAL)+'%';
  $('result-reason').textContent=state.reason==='time'?'Час вичерпано: незаповнені питання оцінено як неправильні.':'Завершено вручну. Незаповнені питання оцінено як неправильні.';
  const p=state.ids.filter(id=>prioritySet.has(id)),failed=p.filter(id=>!isCorrect(id));
  $('priority-note').textContent='Питання про пріоритет руху: '+p.length+' у цьому варіанті, неправильних відповідей: '+failed.length+'.';
  const wrongAnswered=state.ids.filter(id=>isAnswered(id)&&!isCorrect(id)).length;
  $('history-result').textContent=`Із попередніх помилок включено: ${state.reviewIds.length}. У черзі на повторення зараз: ${pendingReview().length}. Нових неправильних відповідей у цьому екзамені: ${wrongAnswered}. Питання без відповіді не додаються до історії помилок.`;
  $('show-key').checked=false;fillResultTable();
 }
 function fillResultTable(){
  const show=$('show-key').checked;
  const t=$('result-body');t.replaceChildren();document.querySelectorAll('.key-col').forEach(e=>e.hidden=!show);
  state.ids.forEach((id,i)=>{
   const tr=document.createElement('tr');const valid=isCorrect(id);const q=byId.get(id);
   for(const value of [i+1,id,answerFor(id)||'—',valid?'Правильно':'Неправильно']){
    const td=document.createElement('td');td.textContent=String(value);if(value==='Правильно')td.className='ok';if(value==='Неправильно')td.className='bad';tr.append(td);
   }
   const key=document.createElement('td');key.className='key-col';key.hidden=!show;key.textContent=q.key;tr.append(key);t.append(tr)
  });
 }
 function csv(){
  if(!state?.finishedAt)return;
  const cols=['№ з/п','№ питання','Обрана/введена відповідь','Оцінка'];
  const rows=state.ids.map((id,i)=>[i+1,id,answerFor(id)||'',isCorrect(id)?'Правильно':'Неправильно']);
  const text='\ufeff'+[cols,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download='autoskola-exam-report.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 }
 function hideConfirm(){$('confirm').hidden=true;confirmation=null;}
 function askConfirm(kind){
  confirmation=kind;$('confirm').hidden=false;
  if(kind==='finish'){$('modal-heading').textContent='Завершити екзамен?';$('modal-text').textContent='Без відповіді залишилося '+(TOTAL-answeredCount())+' питань. Після завершення можна буде переглянути звіт.';$('accept-confirm').textContent='Завершити';}
  else{$('modal-heading').textContent='Почати новий екзамен?';$('modal-text').textContent='Поточний незавершений екзамен буде замінено новим. Збережені відповіді зникнуть.';$('accept-confirm').textContent='Почати новий';}
 }
 function handleNew(){if(state&&!state.finishedAt)askConfirm('restart');else startExam()}
 function setup(){
  $('gate-form').addEventListener('submit',ev=>{ev.preventDefault();unlock($('gate-key').value)});
  $('lock-btn').addEventListener('click',lockAccess);
  $('start-btn').addEventListener('click',handleNew);$('resume-btn').addEventListener('click',()=>{if(state&&!state.finishedAt){showScreen('exam');renderExam()}});$('show-last-btn').addEventListener('click',renderResult);
  $('new-exam-btn').addEventListener('click',startExam);$('export-btn').addEventListener('click',csv);$('show-key').addEventListener('change',fillResultTable);
  $('finish-top').addEventListener('click',()=>askConfirm('finish'));$('finish-bottom').addEventListener('click',()=>askConfirm('finish'));
  $('prev-btn').addEventListener('click',()=>move(state.index-1));$('next-btn').addEventListener('click',()=>move(state.index+1));
  $('zoom-btn').addEventListener('click',()=>{zoomed=!zoomed;$('paper').classList.toggle('zoomed',zoomed);$('zoom-btn').textContent=zoomed?'Вписати сторінку':'Збільшити сторінку';$('zoom-btn').setAttribute('aria-pressed',String(zoomed))});
  $('cancel-confirm').addEventListener('click',hideConfirm);$('accept-confirm').addEventListener('click',()=>{const which=confirmation;hideConfirm();if(which==='finish'){finishExam('manual');renderResult()}else if(which==='restart')startExam()});
  $('confirm').addEventListener('click',ev=>{if(ev.target===$('confirm'))hideConfirm()});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape' && !$('confirm').hidden){hideConfirm();return}if(currentScreen!=='exam'||!$('confirm').hidden||['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(ev.key==='ArrowRight'&&state.index<TOTAL-1)move(state.index+1);if(ev.key==='ArrowLeft'&&state.index>0)move(state.index-1)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  window.setInterval(tick,1000);
  let previous=null;try{previous=sessionStorage.getItem(AUTH_SESSION)}catch{}
  if(previous===KEY_HASH)setAccess(previous);
  else{showScreen('gate');$('gate-key').focus()}

 }
 setup();
})();
