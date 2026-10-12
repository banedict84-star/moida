const fs=require('fs'),assert=require('assert');
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1280,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{let f=new URL(r.request().url()).pathname.slice(1);if(f==='platform.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});return fs.existsSync(f)?r.fulfill({path:f}):r.abort();});
 await p.goto('https://moida.test/platform.html');
 await p.evaluate(()=>{let office=document.getElementById('moidaOffice');document.body.replaceChildren(office);document.body.style.overflow='auto';let input=document.createElement('textarea');input.id='aiInput';document.body.append(input);window.__go=page=>window.lastPage=page;window.MOIDA={uidOf:()=> 'test',auth:{currentUser:{uid:'test'}},db:{},fs:{doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>({officeEmployees:{M021:{paused:false}}})}),setDoc:async()=>{}},onData:fn=>fn()};});
 for(const f of ['office-staff-catalog.js','moida-core-team.js','office-workspace.js'])await p.addScriptTag({content:fs.readFileSync(f,'utf8')});
 await p.waitForFunction(()=>document.querySelectorAll('.mo-core-card').length===8);await p.waitForTimeout(100);
 assert.equal(await p.locator('.mo-tabs button[aria-selected=true]').textContent(),'우리 팀 9');
 assert.equal(await p.locator('.mo-chat').isVisible(),false);
 const assign=await p.evaluate(()=>window.MOIDA_OFFICE_ASSIGNMENTS('담이에게 통화 요약을 부탁해'));assert.deepEqual(assign.map(x=>x.agent),['core_dami']);
 await p.locator('[data-mo-assign=core_semi]').click();assert.equal(await p.evaluate(()=>window.lastPage),'secretary');assert((await p.locator('#aiInput').inputValue()).includes('셈이'));
 await p.screenshot({path:'moida-core-team-desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'moida-core-team-mobile.png',fullPage:true});
 await p.locator('.mo-tabs [data-mo-tab=hire]').click();assert.equal(await p.locator('.mo-core-card').count(),0);await p.locator('#moSearch').fill('M021');assert(await p.locator('[data-employee-id=M021]').count());assert.deepEqual(errors,[]);await b.close();console.log('PASS core team, preserved hired specialist, delegation, chat handoff and mobile layout');
})().catch(e=>{console.error(e);process.exit(1)});
