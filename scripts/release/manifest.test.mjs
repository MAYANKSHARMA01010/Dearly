import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {sha256} from './policy.mjs';
test('real release verifier rejects source/native metadata tampering and duplicate checksum entries',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'dearly-release-contract-'));
 try{
  const write=(p,v)=>writeFileSync(resolve(root,p),typeof v==='string'?v:JSON.stringify(v));
  for(const p of ['scripts','backend','frontend','assets'])mkdirSync(resolve(root,p));
  copyFileSync(new URL('../release.mjs',import.meta.url),resolve(root,'scripts/release.mjs'));
  write('VERSION','1.6.0');
  for(const name of ['backend','frontend']){write(name+'/package.json',{version:'1.6.0'});write(name+'/package-lock.json',{version:'1.6.0',packages:{'':{version:'1.6.0'}}});}
  write('frontend/app.json',{expo:{version:'1.6.0',android:{versionCode:13,package:'test.dearly'},ios:{buildNumber:'13'}}});
  const git=(...a)=>execFileSync('git',a,{cwd:root,stdio:['ignore','pipe','pipe']});
  git('init');git('add','VERSION','scripts','backend','frontend');git('-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','-m','test fixture');
  const commit=git('rev-parse','HEAD').toString().trim(),tag='v1.6.0-rc.1';
  const apk='Dearly-'+tag+'-arm64.apk',zip='Dearly-'+tag+'-source.zip';
  write('assets/'+apk,'synthetic APK bytes');
  writeFileSync(resolve(root,'assets',zip),git('archive','--format=zip','--prefix=Dearly-'+tag+'/','HEAD'));
  let manifest={version:'1.6.0',androidVersionCode:13,iosBuildNumber:'13',package:'test.dearly',commit,tag,files:[apk,zip].map(name=>({name,sha256:sha256(readFileSync(resolve(root,'assets',name))),bytes:readFileSync(resolve(root,'assets',name)).length}))};
  const save=(duplicate=false)=>{write('assets/release.json',manifest);const names=duplicate?[apk,apk,'release.json']:[apk,zip,'release.json'];write('assets/SHA256SUMS',names.map(n=>sha256(readFileSync(resolve(root,'assets',n)))+'  '+n).join('\n')+'\n');};
  const run=()=>spawnSync(process.execPath,['scripts/release.mjs','verify','assets'],{cwd:root,encoding:'utf8'}).status;
  save();assert.equal(run(),0);
  manifest.androidVersionCode=12;save();assert.notEqual(run(),0);
  manifest.androidVersionCode=13;manifest.commit='f'.repeat(40);save();assert.notEqual(run(),0);
  manifest.commit=commit;save(true);assert.notEqual(run(),0);
  save();write('assets/'+zip,'forged archive');manifest.files[1]={name:zip,sha256:sha256('forged archive'),bytes:14};save();assert.notEqual(run(),0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
