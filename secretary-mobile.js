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
})();
