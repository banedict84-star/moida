const fs=require('fs'),assert=require('assert');const{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const ai=(await import('../secretary-pricing.js')).aiModelInfo({});const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.setContent('<style>body{margin:16px;background:#f6f8fa;font-family:Arial}#adminAiUsage{max-width:1050px;margin:auto}</style><select id="secretaryModelSelect"><option value="gpt-6.1-sol">Sol</option></select><section id="adminAiUsage" class="ai-management"></section>');
 await page.addStyleTag({content:fs.readFileSync('admin-ai-usage.css','utf8')});
 await page.evaluate(ai=>{window.MOIDA={esc:s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),auth:{currentUser:{uid:'owner',getIdToken:async()=> 'test'}},onData:f=>window.update=f};window.fetch=async()=>Response.json({ok:true,month:'2026-10',krwPerUsd:1400,ai,totals:{calls:2,tokens:4000,images:0,costKrw:.8,unpricedCalls:1},rows:[{model:'unknown<script>',calls:1,total_tokens:2000,costKrw:null,operation:'chat'},{model:'gpt-6.1-sol',calls:1,total_tokens:2000,costKrw:.8,operation:'analysis'}]});},ai);
 await page.addScriptTag({content:fs.readFileSync('admin-ai-usage.js','utf8')});await page.getByRole('heading',{name:'대화 모델 요금'}).waitFor();
 assert.equal(await page.locator('.ai-model').count(),3);assert.match(await page.locator('#adminAiContent').innerText(),/단가 확인 필요/);assert.match(await page.locator('#adminAiContent').innerText(),/1원 미만/);assert.equal(await page.locator('.ai-selected').innerText(),'선택 중');assert.equal(await page.locator('#adminAiContent script').count(),0);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);await page.screenshot({path:'admin-ai-usage-'+width+'.png',fullPage:true});}
 await page.evaluate(()=>{MOIDA.auth.currentUser=null;update();});assert.match(await page.locator('#adminAiContent').innerText(),/로그인 후/);assert.equal(await page.locator('.ai-model').count(),0);
 await browser.close();console.log('PASS models, partial costs, escaping, account isolation, 320/390/1440px');
})().catch(e=>{console.error(e);process.exit(1);});
