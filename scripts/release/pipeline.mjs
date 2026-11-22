#!/usr/bin/env node
// Trusted local coordinator. Never register this Mac as a public-repo Actions runner.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {releasePlan} from './plan.mjs';
import {validateMigrations,deploymentReady,ciReady,sha256,advance,tagMatches} from './policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(resolve(root,'backend/package.json'));
const {parse}=require('dotenv');
const [mode,tag]=process.argv.slice(2);
if(!['run','resume'].includes(mode)||!/^v\d+\.\d+\.\d+-rc\.[1-9]\d*$/.test(tag??''))throw Error('Use run or resume with an explicit RC tag. Stable promotion needs device acceptance.');
const area=resolve(root,'backend/.runtime/releases',tag),lock=resolve(root,'backend/.runtime/release.lock');
mkdirSync(area,{recursive:true,mode:0o700});
try{mkdirSync(lock,{mode:0o700});}catch{console.error('RELEASE_LOCKED: inspect the existing coordinator before removing its lock.');process.exit(1);}
writeFileSync(resolve(lock,'pid'),String(process.pid),{mode:0o600});
let state={tag,stage:'STARTED',completed:[],commit:null};
let initialized=false;
const statePath=resolve(area,'state.json');
function save(){writeFileSync(statePath+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(statePath+'.tmp',statePath);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let commandNo=0;
function command(bin,args,options={}){
 return new Promise((resolveResult,reject)=>{
  const child=spawn(bin,args,{cwd:options.cwd??root,env:options.env??process.env,stdio:['ignore','pipe','pipe'],detached:true});
  const chunks=[];let bytes=0;
  const log=resolve(area,'command-'+(++commandNo)+'-'+Date.now()+'.private.log');
  writeFileSync(log,'',{mode:0o600});
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes<32*1024*1024)chunks.push(b);writeFileSync(log,b,{flag:'a',mode:0o600});});
  child.stderr.on('data',b=>writeFileSync(log,b,{flag:'a',mode:0o600}));
  const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM');}catch{};setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000).unref();},options.timeout??120000);timeout.unref();
  child.once('error',()=>{clearTimeout(timeout);reject(Error('COMMAND_UNAVAILABLE'));});
  child.once('close',code=>{clearTimeout(timeout);code===0?resolveResult(Buffer.concat(chunks).toString().trim()):reject(Error('COMMAND_FAILED'));});
 });
}
const git=(...a)=>command('git',a);
const gh=(...a)=>command('gh',a);
async function step(name,work){
 await advance(state,name,async()=>{
  console.log(JSON.stringify({stage:name,status:'running'}));
  if(state.commit && await git('rev-parse','HEAD')!==state.commit)throw Error('SOURCE_CHANGED');
  await work();
  if(state.commit && await git('rev-parse','HEAD')!==state.commit)throw Error('SOURCE_CHANGED');
  console.log(JSON.stringify({stage:name,status:'passed'}));
 },save);
}
async function poll(work,minutes){const deadline=Date.now()+minutes*60000;do{if(await work())return;await sleep(20000);}while(Date.now()<deadline);throw Error('WAIT_EXPIRED');}
async function main(){
 if(mode==='resume'){if(!existsSync(statePath))throw Error('NO_RELEASE_TO_RESUME');state=JSON.parse(readFileSync(statePath));if(state.tag!==tag)throw Error('RELEASE_STATE_MISMATCH');}
 else if(existsSync(statePath))throw Error('EXISTING_RELEASE_USE_RESUME');
 initialized=true;
 const commit=await git('rev-parse','HEAD');
 if(state.commit&&state.commit!==commit)throw Error('SOURCE_CHANGED');state.commit=commit;save();
 if(await git('branch','--show-current')!=='main')throw Error('MAIN_REQUIRED');
 if(await git('diff','--name-only','HEAD','--','frontend','backend','scripts','docs','.github','VERSION','AGENTS.md','README.md'))throw Error('DIRTY_RELEASE_SOURCE');
 if(await git('ls-files','--others','--exclude-standard','--','frontend','backend','scripts','docs','.github','VERSION'))throw Error('UNTRACKED_RELEASE_SOURCE');
 if((await git('ls-remote','origin','refs/heads/main')).split(/\s/)[0]!==commit)throw Error('REMOTE_MAIN_MISMATCH');
 if(!tagMatches(await git('ls-remote','origin','refs/tags/'+tag,'refs/tags/'+tag+'^{}'),commit))throw Error('REMOTE_TAG_SOURCE_MISMATCH');
 const metadata=JSON.parse(await command(process.execPath,['scripts/release.mjs','check',tag]));
 const env=parse(readFileSync(resolve(root,'backend/.env')));
 const config=parse(readFileSync(resolve(root,'backend/.runtime/release.env')));
 const base=new URL(config.RELEASE_API_URL);
 if(base.origin!=='https://dearly-z8zm.onrender.com'||base.href!==base.origin+'/')throw Error('INVALID_RELEASE_ORIGIN');
 const hook=new URL(readFileSync(config.RELEASE_DEPLOY_HOOK_FILE,'utf8').trim());
 if(hook.origin!=='https://api.render.com'||hook.pathname!=='/deploy/srv-dbvbkc67bikc7385bv8g'||!hook.searchParams.get('key'))throw Error('INVALID_DEPLOY_HOOK');
 if(!/^[a-f0-9]{64}$/.test(env.MONITORING_TOKEN??''))throw Error('MONITOR_CONFIGURATION_REQUIRED');
 await step('CI',async()=>poll(async()=>{const runs=JSON.parse(await gh('run','list','--workflow','ci.yml','--commit',commit,'--limit','30','--json','headSha,headBranch,event,status,conclusion,databaseId'));if(runs.some(r=>r.headSha===commit&&r.event==='push'&&r.status==='completed'&&r.conclusion!=='success'))throw Error('CI_FAILED');if(!ciReady(runs,commit))return false;state.ciRun=runs.find(r=>r.conclusion==='success').databaseId;return true;},35));
 // Read-only migration verification is rerun on resume; no unreviewed SQL is applied.
 const local=readdirSync(resolve(root,'backend/prisma/migrations')).filter(n=>/^\d/.test(n)).sort().map(name=>({name,checksum:sha256(readFileSync(resolve(root,'backend/prisma/migrations',name,'migration.sql')))}));
 const {Client}=require('pg');const db=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:10000});db.on('error',()=>{});
 try{await db.connect();const rows=await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');state.migrations=validateMigrations(local,rows.rows);}finally{await db.end().catch(()=>{});}save();
 await step('BUILD',async()=>{
  await command('sh',['scripts/build-android-apk.sh'],{timeout:30*60000,env:{...process.env,GRADLE_OPTS:'-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false'}});
  state.apkHash=sha256(readFileSync(resolve(root,'frontend/artifacts/Dearly-preview.apk')));
 });
 if(!state.completed.includes('PACKAGE')&&state.apkHash!==sha256(readFileSync(resolve(root,'frontend/artifacts/Dearly-preview.apk'))))throw Error('APK_CHANGED');
 await step('PACKAGE',async()=>{await command(process.execPath,['scripts/release.mjs','package',tag,'frontend/artifacts/Dearly-preview.apk']);});
 const assets=resolve(root,'frontend/artifacts/releases',tag);
 await command(process.execPath,['scripts/release.mjs','verify',assets]);
 await step('SIGNER',async()=>{
  const releases=JSON.parse(await gh('release','list','--limit','100','--json','tagName,isDraft'));
  const previous=releases.find(r=>!r.isDraft&&r.tagName!==tag&&/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(r.tagName));if(!previous)throw Error('PREVIOUS_SIGNER_REQUIRED');
  const out=resolve(area,'previous');mkdirSync(out,{recursive:true});await gh('release','download',previous.tagName,'--pattern','*-arm64.apk','--dir',out,'--clobber');
  const sdk=process.env.ANDROID_HOME??resolve(homedir(),'Library/Android/sdk');const tool=readdirSync(resolve(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).find(v=>existsSync(resolve(sdk,'build-tools',v,'apksigner')));
  const java=await command('/usr/libexec/java_home',['-v','17']);
  const digest=async p=>{const text=await command(resolve(sdk,'build-tools',tool,'apksigner'),['verify','--print-certs',p],{env:{...process.env,JAVA_HOME:java}});const hashes=[...text.matchAll(/certificate SHA-256 digest:\s*([a-f0-9]+)/gi)].map(m=>m[1]).sort();if(!hashes.length)throw Error('SIGNER_UNAVAILABLE');return JSON.stringify(hashes);};
  if(await digest(resolve(out,readdirSync(out).find(n=>n.endsWith('.apk'))))!==await digest(resolve(assets,'Dearly-'+tag+'-arm64.apk')))throw Error('SIGNER_CHANGED');
  state.previousTag=previous.tagName;
 });
 await step('DEPLOY_REQUEST',async()=>{
  // Record uncertainty before POST; resume never repeats an uncertain deployment.
  state.deployAttempted=true;save();hook.searchParams.set('ref',commit);
  const r=await fetch(hook,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('DEPLOY_REQUEST_UNCONFIRMED');
  const value=await r.json();state.deployId=value.deploy?.id??value.id??null;
 });
 await step('HOSTED',async()=>poll(async()=>{
  try{const r=await fetch(new URL('/internal/operations/status',base),{headers:{Authorization:'Bearer '+env.MONITORING_TOKEN},redirect:'error',signal:AbortSignal.timeout(90000)});if(!r.ok)return false;const j=await r.json();return deploymentReady(j.data,{commit,version:metadata.version,migrations:state.migrations});}catch{return false;}
 },20));
 // Recheck exact identity immediately before publication, including on resume.
 const current=await fetch(new URL('/internal/operations/status',base),{headers:{Authorization:'Bearer '+env.MONITORING_TOKEN},signal:AbortSignal.timeout(90000),redirect:'error'});
 if(!current.ok||!deploymentReady((await current.json()).data,{commit,version:metadata.version,migrations:state.migrations}))throw Error('HOSTED_IDENTITY_CHANGED');
 await step('DRAFT',async()=>{
  let existing;try{existing=JSON.parse(await gh('release','view',tag,'--json','isDraft,targetCommitish'));}catch{}
  if(existing)throw Error('EXISTING_RELEASE_REQUIRES_RECONCILIATION');
  const changes=releasePlan().changes.map(c=>'- '+c.subject+' ('+c.commit.slice(0,7)+')').join('\n');
  const notes=resolve(area,'notes.md');writeFileSync(notes,`Dearly ${metadata.version} release candidate\n\nSource: ${commit}. Android build ${metadata.androidVersionCode}.\n\n${changes}\n\nCoordinated release: full CI, signed local ARM64 APK, unchanged signer, migration checks and exact hosted source/readiness verified before publication.\n\nAPI: ${base.origin}/api/docs\n\nPhysical Android, native iOS, real push and full screen-reader acceptance are recorded separately. RC is not stable. No automatic provider test messages. Free services can sleep or delay work.\n`,{mode:0o600});
  await gh('release','create',tag,...['Dearly-'+tag+'-arm64.apk','Dearly-'+tag+'-source.zip','release.json','SHA256SUMS'].map(n=>resolve(assets,n)),'--target',commit,'--draft','--prerelease','--title','Dearly '+metadata.version+' RC'+tag.split('-rc.')[1],'--notes-file',notes);
 });
 await step('DRAFT_VERIFIED',async()=>{const out=resolve(area,'draft-download');await gh('release','download',tag,'--dir',out,'--clobber');await command(process.execPath,['scripts/release.mjs','verify',out]);});
 await step('HOSTED_DRAFT_VERIFIED',async()=>{
  const dispatchedAt=new Date(Math.floor(Date.now()/1000)*1000).toISOString();state.draftCheckRequestedAt=dispatchedAt;save();
  await gh('workflow','run','release.yml','--ref','main','-f','tag='+tag,'-f','source='+commit);
  await poll(async()=>{
   const runs=JSON.parse(await gh('run','list','--workflow','release.yml','--event','workflow_dispatch','--commit',commit,'--limit','20','--json','status,conclusion,databaseId,displayTitle,createdAt'));
   const found=runs.find(r=>r.displayTitle==='Verify '+tag&&r.createdAt>=dispatchedAt);
   if(!found||found.status!=='completed')return false;
   state.draftAssetRun=found.databaseId;if(found.conclusion!=='success')throw Error('DRAFT_ASSET_CHECK_FAILED');return true;
  },12);
 });
 await step('PUBLISH',async()=>{const r=JSON.parse(await gh('release','view',tag,'--json','isDraft,targetCommitish'));if(r.targetCommitish!==commit)throw Error('RELEASE_SOURCE_MISMATCH');if(r.isDraft)await gh('release','edit',tag,'--draft=false','--prerelease');});
 await step('PUBLIC_VERIFIED',async()=>{const out=resolve(area,'published-download');await gh('release','download',tag,'--dir',out,'--clobber');await command(process.execPath,['scripts/release.mjs','verify',out]);await poll(async()=>{const runs=JSON.parse(await gh('run','list','--workflow','release.yml','--event','release','--commit',commit,'--limit','10','--json','status,conclusion,databaseId'));if(runs.some(r=>r.status==='completed'&&r.conclusion!=='success'))throw Error('PUBLISHED_ASSET_CHECK_FAILED');const passed=runs.find(r=>r.status==='completed'&&r.conclusion==='success');if(passed)state.assetRun=passed.databaseId;return !!passed;},12);});
 state.stage='COMPLETE';delete state.failure;save();console.log(JSON.stringify({status:'complete',tag,commit,ciRun:state.ciRun,assetRun:state.assetRun}));
}
// Deploy ambiguity: skip a repeat POST and reconcile exact hosted identity instead.
if(mode==='resume'&&existsSync(statePath)){const prior=JSON.parse(readFileSync(statePath));if(prior.deployAttempted&&!prior.completed.includes('DEPLOY_REQUEST')){prior.completed.push('DEPLOY_REQUEST');writeFileSync(statePath,JSON.stringify(prior,null,2),{mode:0o600});}}
main().catch(()=>{if(initialized){state.failure='RELEASE_STOPPED_REVIEW_PRIVATE_LOGS';save();}console.error('RELEASE_STOPPED: state and private logs retained. No automatic rollback or provider replay.');process.exitCode=1;}).finally(()=>rmSync(lock,{recursive:true,force:true}));
