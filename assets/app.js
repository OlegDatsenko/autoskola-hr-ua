(function(){'use strict';
var list=document.querySelector('[data-search-page]');if(!list)return;
var search=document.getElementById('search'),clear=document.getElementById('clear'),count=document.getElementById('count'),empty=document.getElementById('empty'),severity=document.getElementById('severity'),onlySaved=document.getElementById('only-saved');
var buttons=[].slice.call(document.querySelectorAll('[data-category]'));
var items=[].slice.call(list.querySelectorAll('[data-item]'));
var storageKey='autoskola-favorites-v1';var saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{}}catch(e){}
var mode=list.getAttribute('data-search-page');var activeCategory='all';var favOnly=false;
function normalize(s){s=String(s||'').toLowerCase().replace(/đ/g,'d').replace(/š/g,'s').replace(/č/g,'c').replace(/ć/g,'c').replace(/ž/g,'z');try{s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(e){}return s.trim()}
function hasWords(hay,needle){var parts=needle.split(/\s+/);for(var i=0;i<parts.length;i++){if(parts[i]&&!hay.includes(parts[i]))return false}return true}
for(var j=0;j<items.length;j++){
 (function(card){var fav=card.querySelector('[data-fav]'),key=card.getAttribute('data-id');if(!fav)return;
 function update(){var selected=!!saved[key];fav.setAttribute('aria-pressed',selected?'true':'false');fav.textContent=selected?'★':'☆';fav.setAttribute('aria-label',selected?'Прибрати з обраного':'Додати в обране')}
 fav.addEventListener('click',function(){if(saved[key])delete saved[key];else saved[key]=1;try{localStorage.setItem(storageKey,JSON.stringify(saved))}catch(e){}update();if(favOnly)apply()});update();})(items[j]);
}
function apply(){var needle=normalize(search.value),diff=severity?parseInt(severity.value,10)||0:0,shown=0;
for(var k=0;k<items.length;k++){var item=items[k],category=item.getAttribute('data-category'),risk=parseInt(item.getAttribute('data-risk'),10)||1;var show=(!needle||hasWords(item._index||'',needle))&&(activeCategory==='all'||category===activeCategory)&&risk>=diff&&(!favOnly||!!saved[item.getAttribute('data-id')]);item.hidden=!show;if(show)shown++}
count.textContent='Показано '+shown+' із '+items.length;empty.hidden=shown!==0;clear.hidden=!search.value;
}
for(var m=0;m<items.length;m++){items[m]._index=normalize(items[m].getAttribute('data-index')||items[m].textContent)}
buttons.forEach(function(btn){btn.addEventListener('click',function(){activeCategory=btn.getAttribute('data-category');buttons.forEach(function(other){other.setAttribute('aria-pressed',String(other===btn))});apply()})});
if(onlySaved)onlySaved.addEventListener('click',function(){favOnly=!favOnly;onlySaved.classList.toggle('active',favOnly);onlySaved.setAttribute('aria-pressed',String(favOnly));onlySaved.setAttribute('aria-label',favOnly?'Показати всі записи':'Тільки обране');apply()});
if(severity)severity.addEventListener('change',apply);
function updateSoon(){setTimeout(apply,0)}
['input','keyup','change','search','compositionend'].forEach(function(event){search.addEventListener(event,apply,false)});search.addEventListener('paste',updateSoon,false);search.addEventListener('cut',updateSoon,false);
clear.addEventListener('click',function(){search.value='';apply();search.focus()});
try{var params=new URLSearchParams(location.search);search.value=params.get('q')||''}catch(e){}
window.addEventListener('pageshow',apply);apply();
})();