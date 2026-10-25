/* Adapt existing controls to Tabler without changing routes, data or handlers. */
(() => {
 const primary='.mo-primary,.sms-primary,.btn.primary,.btn.save,.mbtn.primary,.mbtn2.primary,.dc-connect,.workspace-primary';
 const buttons=primary+',.mo-outline,.mo-button,.workspace-button,.automation-actions button,.automation-filters button,.office-tool-panel button,#solapiMessaging button,.crm-sheet-actions button,.dc-dialog button';
 function enhance(root){
  for(const el of root.querySelectorAll(buttons)){
   if(el.dataset.moidaStyled)continue;
   el.dataset.moidaStyled='true';el.classList.add('btn','btn-sm','moida-control');
   if(el.matches(primary))el.classList.add('btn-primary');
  }
  for(const el of root.querySelectorAll('.mo-panel,.mo-report,.sms-card,.automation-instance'))el.classList.add('moida-card');
 }
 let queued=false;
 const observer=new MutationObserver(records=>{
  if(!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1))||queued)return;
  queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});
 });
 enhance(document);observer.observe(document.body,{childList:true,subtree:true});
})();
