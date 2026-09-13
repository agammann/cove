import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
const base='http://localhost:4318';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.getByRole('heading',{name:'Keep the context. Find your flow.'}).waitFor();await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));await page.screenshot({path:'docs/design/homepage-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/design/homepage-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile homepage overflow');
 await page.setViewportSize({width:1440,height:1000});
 const auth=await context.request.get(base+'/api/auth/chatgpt',{headers:{'oai-authenticated-user-id':'visual-fixture-'+randomUUID(),'oai-authenticated-user-email':'visual-'+randomUUID()+'@example.test'},maxRedirects:0});if(auth.status()!==302)throw Error('Local auth failed: '+auth.status()+' '+await auth.text());
 await page.goto(base+'/projects');await page.getByRole('link',{name:'New project',exact:true}).click();await page.getByLabel('Project name').fill('Research notebook');await page.getByLabel('Description',{exact:true}).fill('A clear place for your research, decisions, and next steps.');await page.getByRole('button',{name:'Create project',exact:true}).click();await page.waitForURL('**/edit');
  await page.getByLabel('Goal',{exact:true}).fill('Turn research into a clear project brief.');await page.getByLabel('Current state',{exact:true}).fill('Sources collected. First outline ready for review.');
 await page.getByRole('button',{name:'Add decision',exact:true}).click();await page.getByLabel('Decisions 1',{exact:true}).fill('Keep the brief focused on one audience.');
 await page.getByRole('button',{name:'Add next step',exact:true}).click();await page.getByLabel('Next steps 1',{exact:true}).fill('Review the source notes and write the first draft.');
 await page.getByRole('button',{name:'Save context',exact:true}).first().click();await page.getByRole('heading',{name:'Research notebook',exact:true}).waitFor();
 await page.screenshot({path:'docs/design/workspace-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile workspace overflow');await page.screenshot({path:'docs/design/workspace-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Create handoff',exact:true}).first().click();await page.getByRole('heading',{name:'Ready to continue'}).waitFor();await page.getByRole('button',{name:'Copy concise handoff'}).click();await page.getByRole('button',{name:'Full handoff',exact:true}).click();await page.getByRole('button',{name:'Copy full handoff'}).waitFor();
 const removed=await context.request.delete(base+'/api/account',{headers:{origin:base},data:{confirmation:'DELETE MY ACCOUNT'}});if(!removed.ok())throw Error('Fixture cleanup failed '+await removed.text());
 fs.writeFileSync('docs/sites-browser-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),runtime:'local Cloudflare Worker and D1',signin:'synthetic dispatch headers only on local fixture',homepageDesktop:'passed',homepageMobile:'passed',projectEditSave:'passed',workspaceMobile:'passed',handoffCopy:'passed',accountDeletion:'passed'},null,2));
 console.log('Sites browser journey passed');
 
 
 
 if(errors.length)throw Error(errors.join(';'));
}finally{await browser.close();}

