(function(){
 'use strict';
 var frame=0;
 function update(){
  frame=0;
  var viewport=window.visualViewport;
  var height=viewport?viewport.height:window.innerHeight;
  if(viewport&&Math.abs(viewport.scale-1)>0.02)return;
  document.documentElement.style.setProperty('--secretary-visible-height',Math.round(height)+'px');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 window.addEventListener('resize',schedule);
 window.addEventListener('orientationchange',schedule);
 if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule);
 update();
 function historyControls(){
  var panel=document.getElementById('aiHistoryPanel'),header=document.getElementById('appHeader');
  if(!panel||!header)return;
  var button=document.createElement('button');
  button.id='mobileChatHistory';button.type='button';button.textContent='대화 기록';
  button.setAttribute('aria-controls','aiHistoryPanel');button.setAttribute('aria-expanded','false');
  var close=document.createElement('button');close.id='mobileChatHistoryClose';close.type='button';close.textContent='닫기';
  function toggle(open){panel.classList.toggle('mobile-history-open',open);button.setAttribute('aria-expanded',String(open));if(!open)button.focus();}
  button.addEventListener('click',function(){toggle(!panel.classList.contains('mobile-history-open'));});
  close.addEventListener('click',function(){toggle(false);});
  panel.addEventListener('click',function(event){if(event.target.closest('[data-chat-id],#aiHistoryNew')&&!event.target.closest('[data-chat-delete],[data-chat-rename]'))toggle(false);});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&panel.classList.contains('mobile-history-open'))toggle(false);});
  header.appendChild(button);panel.insertBefore(close,panel.firstChild);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',historyControls);else historyControls();
})();
