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
 const pendingReview=()=>Object.keys(progress?.questions||{}).map(Number).filter(id=>byId.has(id)&&progress.questions[id]?.status==='review');
 // Prioritize wrong answers, randomly within the same number of previous mistakes.
 const pickReview=(ids,limit)=>shuffled(ids).sort((a,b)=>(progress?.questions?.[b]?.wrongCount||0)-(progress?.questions?.[a]?.wrongCount||0)).slice(0,limit);

 const PROGRESS_VERSION=3, BANK_SIZE=748;
 const MAX_REVIEW=2, REINFORCE_HISTORY=20, REINFORCE_CLEAN=12, REINFORCE_OLDEST=6;
 // Review intervals count completed exams; cancelling an exam never advances the queue.
 const FIRST_WRONG_GAP=2, REPEATED_WRONG_GAP=1, CORRECT_REVIEW_GAP=3;
 let PROGRESS_STORE=null, progress=null;
 const blankProgress=()=>({version:PROGRESS_VERSION,questions:{},exams:[],legacyIncomplete:false,legacyExamIds:[],updatedAt:null});
 const readProgress=()=>{
  try{
   const v=JSON.parse(localStorage.getItem(PROGRESS_STORE)||'null');
   if(v?.version===PROGRESS_VERSION && v.questions && typeof v.questions==='object' && Array.isArray(v.exams))return v;
  }catch{}
  const v=blankProgress();
  // Upgrade the original Wiki95 incorrect-answer bank without erasing its history.
  for(const [id,prior] of Object.entries(history.wrongs||{})){
   if(!byId.has(Number(id)))continue;
   v.questions[id]={status:prior.needsReview?'review':'mastered',
    wrongCount:Math.max(0,Number(prior.wrongCount)||0),rightCount:Math.max(0,Number(prior.correctAfterWrong)||0),
    lastWrongAt:prior.lastWrongAt||null,lastCorrectAt:prior.lastCorrectAt||null,legacy:true};
  }
  v.legacyExamIds=history.processed.slice();
  v.legacyIncomplete=history.processed.length>0;
  return v;
 };
 const saveProgress=()=>{try{localStorage.setItem(PROGRESS_STORE,JSON.stringify(progress));return true}catch(e){console.warn('Cannot save progress',e);return false}};
 const mastered=id=>progress?.questions?.[id]?.status==='mastered';
 const unmastered=ids=>ids.filter(id=>!mastered(id));
 const repairOldMistakeCounts=()=>{
  for(const [id,q] of Object.entries(progress.questions)){
   const old=Math.max(0,Number(history.wrongs[id]?.wrongCount)||0);
   const present=Math.max(0,Number(q.wrongCount)||0);
   // The previous build sometimes stored skipped legacy questions with status review, wrongCount=0.
   const missingCount=(q.status==='review'||q.lastWrongAt)?1:0;
   q.wrongCount=Math.max(old,present,missingCount);
  }
 };
 const completedExams=()=>progress.exams.length;
 const nextExamNumber=()=>completedExams()+1;
 const wasSeen=id=>!!progress.questions[id]?.status;
 const hasMistake=id=>(Number(progress.questions[id]?.wrongCount)||0)>0;
 const isDue=id=>progress.questions[id]?.status==='review' && (Number(progress.questions[id]?.dueExam)||0)<=nextExamNumber();
 const dueOrder=(ids,count)=>shuffled(ids).sort((a,b)=>
  (Number(progress.questions[a]?.dueExam)||0)-(Number(progress.questions[b]?.dueExam)||0) ||
  (Number(progress.questions[b]?.wrongCount)||0)-(Number(progress.questions[a]?.wrongCount)||0)).slice(0,count);
 const ageOf=id=>{
  const x=progress.questions[id]||{};
  return Number(x.lastSeenExam)||0;
 };
 const recencyWeight=id=>{
  const age=completedExams()-ageOf(id);
  return age<=0?.2:age===1?.45:age===2?.7:1;
 };
 const weightedSample=(ids,count,historyBias)=>ids.map(id=>{
  const errors=Number(progress.questions[id]?.wrongCount)||0;
  const weight=Math.max(.05,recencyWeight(id)*(historyBias?1+Math.min(errors,8)*.65:1));
  return {id,score:Math.pow(Math.random(),1/weight)};
 }).sort((a,b)=>b.score-a.score).slice(0,count).map(x=>x.id);
 const oldestFirst=(ids,count)=>shuffled(ids).sort((a,b)=>ageOf(a)-ageOf(b) ||
  (Number(progress.questions[a]?.lastAttemptAt)||0)-(Number(progress.questions[b]?.lastAttemptAt)||0)).slice(0,count);
 // The full mistake history is permanent: completion removes a question from the *active queue*, never from this list.
 const requiredCorrectRepeats=wrongCount=>Math.min(4,Math.max(2,(Number(wrongCount)||0)+1));
 const overview=()=>{
  let masteredCount=0,reviewCount=0;
  for(const q of EXAM_QUESTIONS){
   const s=progress?.questions?.[q.id]?.status;
   if(s==='mastered')masteredCount++;
   else if(s==='review')reviewCount++;
  }
  return {mastered:masteredCount,review:reviewCount,unrecorded:BANK_SIZE-masteredCount-reviewCount};
 };
 const drawOverview=()=>{
  const s=overview();
  for(const [part,value] of Object.entries(s)){
   const number=$('overview-'+part),bar=$('overview-bar-'+part);
   if(number)number.textContent=String(value);
   if(bar)bar.style.flex=String(value)+' 1 0%';
  }
  const percent=$('overview-percent');if(percent)percent.textContent=(s.mastered*100/BANK_SIZE).toFixed(1).replace('.',',')+'%';
   const covered=$('overview-covered');if(covered)covered.textContent='Охоплено '+(BANK_SIZE-s.unrecorded)+' із '+BANK_SIZE+' ('+((BANK_SIZE-s.unrecorded)*100/BANK_SIZE).toFixed(1).replace('.',',')+'%).';
   const mode=$('overview-mode');if(mode)mode.textContent=s.unrecorded===0?'Режим закріплення: ціль 20 із історії помилок · 12 без помилок · 6 найдавніше перевірених (за наявності).':'Режим освоєння: нові питання + не більше 2 відкладених повторень.';
   const note=$('overview-note');if(note)note.textContent=progress.legacyIncomplete
   ? 'Історія до оновлення збережена частково: деякі давні правильні відповіді невідомі. «Не зафіксовано» не обов’язково означає «не зустрічалося».'
   : 'Усі категорії — унікальні номери питань. «Не зафіксовано» означає, що питання ще не потрапляло до завершених іспитів цього профілю.';
 };
 function exportProgress(){
  if(!unlocked || !PROGRESS_STORE)return;
  // Save the active or last exam as well as every exam recorded since the upgrade.
  const snapshot={format:'autoskola-hrua-wiki95-backup',schema:1,keyFingerprint:KEY_HASH.slice(0,16),
   exportedAt:new Date().toISOString(),bankSize:BANK_SIZE,progress,legacyWrongHistory:history,examState:state};
  const body=JSON.stringify(snapshot,null,2);
  const url=URL.createObjectURL(new Blob([body],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download='wiki95-progress-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 function validExamState(s){
  return s===null || (s?.version===VERSION && Array.isArray(s.ids) && s.ids.length>=1 && s.ids.length<=TOTAL &&
   new Set(s.ids).size===s.ids.length && s.ids.every(id=>Number.isInteger(id)&&byId.has(id)) &&
   s.answers && typeof s.answers==='object' && typeof s.endAt==='number' && Number.isFinite(s.endAt));
 }
 function validBackup(obj){
  if(obj?.format!=='autoskola-hrua-wiki95-backup' || obj.schema!==1 || obj.bankSize!==BANK_SIZE ||
     obj.keyFingerprint!==KEY_HASH.slice(0,16))return false;
  const p=obj.progress;
  if(p?.version!==PROGRESS_VERSION || !p.questions || typeof p.questions!=='object' ||
     !Array.isArray(p.exams) || p.exams.length>20000 || Object.keys(p.questions).length>BANK_SIZE)return false;
  for(const [id,q] of Object.entries(p.questions)){
   if(!/^\d{1,3}$/.test(id)||!byId.has(Number(id))||!['review','mastered'].includes(q?.status))return false;
  }
  for(const ex of p.exams){
   if(typeof ex?.examId!=='string'||ex.examId.length>100 ||!Array.isArray(ex.entries)||ex.entries.length>TOTAL||
      ex.entries.some(e=>!Number.isInteger(e?.id)||!byId.has(e.id)||typeof e.answer!=='string'||e.answer.length>100||typeof e.correct!=='boolean'))return false;
  }
  if(!validExamState(obj.examState??null))return false;
  const h=obj.legacyWrongHistory;
  if(!h || h.version!==1 || !h.wrongs || typeof h.wrongs!=='object'|| !Array.isArray(h.processed))return false;
  return true;
 }
 async function importProgress(file){
  if(!unlocked||!file)return;
  if(file.size>15*1024*1024){alert('Файл надто великий (максимум 15 МБ).');return}
  let data;
  try{data=JSON.parse(await file.text())}catch{alert('Не вдалося прочитати файл JSON.');return}
  if(!validBackup(data)){alert('Несумісна або пошкоджена копія. Перевірте ключове слово та формат файлу.');return}
  if(!confirm('Відновити резервну копію? Поточну локальну історію й активний екзамен буде ЗАМІНЕНО даними з файлу.'))return;
  try{
   localStorage.setItem(PROGRESS_STORE,JSON.stringify(data.progress));
   localStorage.setItem(HISTORY_STORE,JSON.stringify(data.legacyWrongHistory));
   if(data.examState)localStorage.setItem(STORE,JSON.stringify(data.examState));
   else localStorage.removeItem(STORE);
   progress=readProgress();history=readHistory();repairOldMistakeCounts();saveProgress();restore();
   alert('Історію відновлено. Якщо збережений екзамен прострочений, його буде завершено за таймером.');
  }catch(e){alert('Не вдалося записати резервну копію в браузер: '+(e?.message||e));}
 }

 async function digest(s){
  if(!globalThis.crypto?.subtle)throw Error('Для перевірки ключа відкрийте сторінку через HTTPS або сучасний браузер.');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
 }
 function lockAccess(){
  try{sessionStorage.removeItem(AUTH_SESSION)}catch{}
  unlocked=false;STORE=null;HISTORY_STORE=null;PROGRESS_STORE=null;progress=null;state=null;history={version:1,wrongs:{},processed:[]};
  $('gate-key').value='';$('gate-error').textContent='';showScreen('gate');$('gate-key').focus();
 }
 function setAccess(hash){
  unlocked=true;STORE='autoskola_hrua_exam_v2_'+hash.slice(0,16);
  HISTORY_STORE='autoskola_hrua_wrong_history_v2_'+hash.slice(0,16);
  history=readHistory();PROGRESS_STORE='autoskola_hrua_progress_v3_'+hash.slice(0,16);progress=readProgress();repairOldMistakeCounts();saveProgress();try{sessionStorage.setItem(AUTH_SESSION,hash)}catch{}
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
  const queued=pendingReview().length, stats=overview();
  $('history-active').textContent=String(queued);
  $('history-summary').textContent=`Охоплено: ${BANK_SIZE-stats.unrecorded} із ${BANK_SIZE}. Засвоєно: ${stats.mastered}. На повторення: ${queued}.`;
  $('home-stage').textContent=stats.unrecorded===0?'Режим закріплення — ціль 20 / 12 / 6 питань (за наявності).':'Режим освоєння — нові питання та до 2 відкладених повторень за екзамен.';
  const active=state && !state.finishedAt && state.ids.length>=1;
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
   if(s?.version===VERSION && Array.isArray(s.ids) && s.ids.length>=1 && s.ids.length<=TOTAL && new Set(s.ids).size===s.ids.length && s.ids.every(id=>byId.has(id)) && s.answers && typeof s.endAt==='number' && Number.isFinite(s.endAt)){
    state=s;state.index=Math.min(state.ids.length-1,Math.max(0,Number(state.index)||0));
    state.reviewIds=Array.isArray(state.reviewIds)?state.reviewIds:[];
    if(!state.finishedAt && Date.now()>=state.endAt)finishExam('time');
    if(state.finishedAt)recordHistory();
   }
  }catch(e){console.warn('Відновлення недоступне',e)}
  updateHome();showScreen('home');
 }

 function startExam(){
  if(!unlocked)return;
  const all=EXAM_QUESTIONS.map(q=>q.id),selected=[],chosen=new Set();
  const take=(ids,count)=>{
   for(const id of ids){if(selected.length>=TOTAL || count<=0)break;
    if(!chosen.has(id)){selected.push(id);chosen.add(id);count--}
   }
  };
  const inPriority=()=>selected.filter(id=>prioritySet.has(id)).length;
  const due=pendingReview().filter(isDue);
  let mode;
  if(all.some(id=>!wasSeen(id))){
   mode='coverage';
   const unseen=all.filter(id=>!wasSeen(id));
   const unseenPriority=unseen.filter(id=>prioritySet.has(id));
   const quota=unseenPriority.length>=4?4:2;
   const earlyPriority=dueOrder(due.filter(id=>prioritySet.has(id)),Math.min(MAX_REVIEW,quota));
   take(earlyPriority,quota);
   take(shuffled(unseenPriority),quota-inPriority());
   // Explicit priority quota exception: old mastered questions may appear for road-safety practice.
   if(inPriority()<quota){
    take(oldestFirst(PRIORITY_IDS.filter(id=>!chosen.has(id)&&mastered(id)),quota-inPriority()),quota-inPriority());
   }
   const reviewSlots=MAX_REVIEW-earlyPriority.length;
   take(dueOrder(due.filter(id=>!prioritySet.has(id)),reviewSlots),reviewSlots);
   take(shuffled(unseen.filter(id=>!prioritySet.has(id))),TOTAL-selected.length);
   // The final coverage exam can be shorter than 38 rather than silently repeating mastered questions.
  }else{
   mode='reinforcement';
   const eligible=all.filter(id=>progress.questions[id]?.status!=='review'||isDue(id));
   const dueEligible=dueOrder(due,TOTAL);
   // Reserve at least two priority questions while respecting review cooldown whenever possible.
   const mandatory=[];
   const reserve=(pool,n)=>{for(const id of pool){if(mandatory.length>=n)break;if(!mandatory.includes(id))mandatory.push(id)}};
   reserve(dueEligible.filter(id=>prioritySet.has(id)),2);
   reserve(weightedSample(eligible.filter(id=>prioritySet.has(id)&&hasMistake(id)&&!mandatory.includes(id)),2,true),2);
   reserve(oldestFirst(eligible.filter(id=>prioritySet.has(id)&&!mandatory.includes(id)),2),2);
   if(mandatory.length<2)reserve(oldestFirst(PRIORITY_IDS.filter(id=>!mandatory.includes(id)),2),2);
   const mandatoryWrong=mandatory.filter(hasMistake),mandatoryClean=mandatory.filter(id=>!hasMistake(id));
   take(mandatoryWrong,REINFORCE_HISTORY);
   const missingHistory=REINFORCE_HISTORY-selected.length;
   take(dueEligible.filter(hasMistake),missingHistory);
   take(weightedSample(eligible.filter(hasMistake).filter(id=>!chosen.has(id)),REINFORCE_HISTORY-selected.length,true),REINFORCE_HISTORY-selected.length);
   // Reserve the originally required clean priority questions as part of the clean category.
   const baseClean=selected.length;
   take(mandatoryClean,REINFORCE_CLEAN);
   take(weightedSample(eligible.filter(id=>!hasMistake(id)&&!chosen.has(id)),REINFORCE_CLEAN-(selected.length-baseClean),false),REINFORCE_CLEAN-(selected.length-baseClean));
   const baseOldest=selected.length;
   take(oldestFirst(eligible.filter(id=>!chosen.has(id)),REINFORCE_OLDEST),REINFORCE_OLDEST);
   // If a group has too few questions, use remaining eligible ones to still form 38.
   take(oldestFirst(eligible.filter(id=>!chosen.has(id)),TOTAL-selected.length),TOTAL-selected.length);
   // Even extreme/imperfect imported histories must never yield an empty exam.
   if(selected.length<TOTAL)take(oldestFirst(all.filter(id=>!chosen.has(id)),TOTAL-selected.length),TOTAL-selected.length);
  }
  const ids=shuffled(selected);
  if(!ids.length||ids.length>TOTAL||new Set(ids).size!==ids.length||ids.filter(id=>prioritySet.has(id)).length<2){
   alert('Не вдалося сформувати екзамен із доступних питань.');return;
  }
  const reviewIds=ids.filter(id=>hasMistake(id));
  const now=Date.now();
  state={version:VERSION,examId:String(now)+'_'+Math.random().toString(36).slice(2,9),ids,reviewIds,mode,
   answers:{},index:0,startedAt:now,endAt:now+DURATION,finishedAt:null,reason:null};
  zoomed=false;safeSet(state);showScreen('exam');renderExam();
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
  const q=activeQ();$('q-progress').textContent='ПИТАННЯ '+(state.index+1)+' ІЗ '+state.ids.length;
  $('q-heading').textContent='Питання №'+q.id;
  $('q-type').textContent=q.type==='multi'?'Варіанти A–D':q.type==='picture'?'Вибір зображення 1–3':'Числова відповідь';
  $('priority-label').hidden=!prioritySet.has(q.id);$('review-label').hidden=!state.reviewIds.includes(q.id);
  $('q-image').src='questions/'+String(q.id).padStart(3,'0')+'.webp';
  $('q-image').alt='Оригінальна PDF-сторінка із запитанням №'+q.id;
  $('q-image').onerror=()=>{$('saved-status').textContent='Не вдалося відкрити зображення №'+q.id+'. Перевірте папку questions.'};
  drawChoices();drawOverlay();drawNav();
  $('prev-btn').disabled=state.index===0;$('next-btn').disabled=state.index===state.ids.length-1;
  $('next-btn').textContent=state.index===state.ids.length-1?'Останнє питання':'Наступне';
  $('saved-status').textContent='Зберігається автоматично';
  $('paper').classList.toggle('zoomed',zoomed);$('zoom-btn').textContent=zoomed?'Вписати сторінку':'Збільшити сторінку';$('zoom-btn').setAttribute('aria-pressed',String(zoomed));
  tick();
 }
 function move(idx){if(!state||state.finishedAt)return;state.index=Math.max(0,Math.min(TOTAL-1,idx));safeSet(state);renderExam();}
 function tick(){if(!state || state.finishedAt)return;const left=state.endAt-Date.now();$('time').textContent=fmtMs(left);$('time').classList.toggle('urgent',left<=5*60*1000);if(left<=0)finishExam('time')}

 function recordHistory(){
  if(!state?.finishedAt || !unlocked || !progress)return;
  const examId=String(state.examId||'legacy_'+state.startedAt);
  if(progress.exams.some(ex=>ex.examId===examId))return;
  const oldProcessed=history.processed.includes(examId),ordinal=nextExamNumber();
  const entries=[];
  for(const id of state.ids){
   const correct=isCorrect(id),answered=isAnswered(id),old=progress.questions[id]||{};
   entries.push({id,answer:answerFor(id),correct,answered});
   const hadError=Number(old.wrongCount)||0;
   // Already-processed old exam: import its entries without incrementing historical counts a second time.
   if(oldProcessed && old.status){
    progress.questions[id]={...old,lastAttemptAt:old.lastAttemptAt||state.finishedAt,
     lastSeenExam:old.lastSeenExam||ordinal};
    continue;
   }
   const errorCount=hadError+(!correct&&(!oldProcessed||!old.status)?1:0);
   const wasInReview=old.status==='review';
   const oldStreak=Number(old.correctStreak)||0;
   let status='mastered',correctStreak=0,dueExam=null;
   if(!correct){
    status='review';
    dueExam=ordinal+1+((hadError||old.status==='mastered')?REPEATED_WRONG_GAP:FIRST_WRONG_GAP);
   }else if(wasInReview){
    correctStreak=oldStreak+(oldProcessed?0:1);
    if(correctStreak<requiredCorrectRepeats(errorCount)){
     status='review';dueExam=ordinal+1+CORRECT_REVIEW_GAP;
    }
   }
   progress.questions[id]={...old,status,wrongCount:errorCount,
    rightCount:(Number(old.rightCount)||0)+(correct&&!oldProcessed?1:0),
    correctStreak,dueExam,lastSeenExam:ordinal,lastAttemptAt:state.finishedAt,
    lastWrongAt:!correct?state.finishedAt:old.lastWrongAt||null,
    lastCorrectAt:correct?state.finishedAt:old.lastCorrectAt||null};
   // This separate legacy record preserves every known mistake, even after mastery.
   const w=history.wrongs[id];
   if(correct){
    if(w){w.needsReview=status==='review';w.lastCorrectAt=state.finishedAt;
     if(!oldProcessed)w.correctAfterWrong=(w.correctAfterWrong||0)+1}
   }else if(!oldProcessed){
    history.wrongs[id]={...w,wrongCount:(w?.wrongCount||0)+1,lastWrongAt:state.finishedAt,
     lastWrongAnswer:answerFor(id),needsReview:true};
   }
  }
  progress.exams.push({examId,startedAt:state.startedAt,finishedAt:state.finishedAt,
   reason:state.reason||'manual',mode:state.mode||'coverage',entries});
  progress.updatedAt=state.finishedAt;
  if(!oldProcessed){history.processed.push(examId);if(history.processed.length>1000)history.processed=history.processed.slice(-1000)}
  saveProgress();saveHistory();
 }
 function finishExam(reason){
  if(!state||state.finishedAt)return;
  state.finishedAt=Date.now();state.reason=reason||'manual';safeSet(state);recordHistory();
  if(currentScreen==='exam'){hideConfirm();showScreen('result');renderResult()}
 }
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

 function renderResult(){
  if(!state?.finishedAt)return;
  showScreen('result');const correct=score(),wrong=state.ids.length-correct;
  $('result-correct').textContent=String(correct);$('result-wrong').textContent=String(wrong);
  $('result-percent').textContent=Math.round(100*correct/state.ids.length)+'%';
  $('result-reason').textContent=state.reason==='time'?'Час вичерпано: незаповнені питання оцінено як неправильні.':'Завершено вручну. Незаповнені питання оцінено як неправильні.';
  const p=state.ids.filter(id=>prioritySet.has(id)),failed=p.filter(id=>!isCorrect(id));
  $('priority-note').textContent='Питання про пріоритет руху: '+p.length+' у цьому варіанті, неправильних відповідей: '+failed.length+'.';
  const incorrect=state.ids.filter(id=>!isCorrect(id)).length;
  $('history-result').textContent=`З історії помилок включено: ${state.reviewIds.length}. Потребують закріплення: ${pendingReview().length}. Неправильних або пропущених у цьому екзамені: ${incorrect}.`;
  drawOverview();$('show-key').checked=false;fillResultTable();
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
  if(kind==='finish'){$('modal-heading').textContent='Завершити екзамен?';$('modal-text').textContent='Без відповіді залишилося '+(state.ids.length-answeredCount())+' питань. Після завершення можна буде переглянути звіт.';$('accept-confirm').textContent='Завершити';}
  else{$('modal-heading').textContent='Почати новий екзамен?';$('modal-text').textContent='Поточний незавершений екзамен буде замінено новим. Збережені відповіді зникнуть.';$('accept-confirm').textContent='Почати новий';}
 }
 function handleNew(){if(state&&!state.finishedAt)askConfirm('restart');else startExam()}
 function setup(){
  $('gate-form').addEventListener('submit',ev=>{ev.preventDefault();unlock($('gate-key').value)});
  $('lock-btn').addEventListener('click',lockAccess);
  $('start-btn').addEventListener('click',handleNew);$('resume-btn').addEventListener('click',()=>{if(state&&!state.finishedAt){showScreen('exam');renderExam()}});$('show-last-btn').addEventListener('click',renderResult);
  for(const suffix of ['home','result']){ $('backup-export-'+suffix).addEventListener('click',exportProgress); $('backup-import-'+suffix).addEventListener('click',()=>$('backup-import-file').click()); }
  $('backup-import-file').addEventListener('change',ev=>{const file=ev.target.files?.[0];ev.target.value='';importProgress(file)});
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
