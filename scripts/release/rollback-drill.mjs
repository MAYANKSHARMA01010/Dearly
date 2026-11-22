// Runs old and current application code against a disposable latest-schema DB.
// Never restores data or changes production. Requires loopback database explicitly.
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,symlinkSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
const root=process.cwd(),require=createRequire(resolve(root,'backend/package.json')),{Client}=require('pg');
const url=new URL(process.env.ROLLBACK_DATABASE_URL??'');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Loopback disposable database required');
const previous=process.env.ROLLBACK_TAG;
if(!/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(previous??''))throw Error('Explicit previous tag required');
const area=mkdtempSync(resolve(tmpdir(),'dearly-rollback-')),name='dearly_rollback_'+randomBytes(6).toString('hex');
let stage='connect';
const db=new Client({connectionString:url.toString()}),children=[];
const run=(cmd,args,cwd=root,env=process.env)=>execFileSync(cmd,args,{cwd,env,stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:32*1024*1024});
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function probe(file,cwd,version,target){
 const port=await freePort();
 const child=spawn(process.execPath,[file],{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DATABASE_URL:target,AUTH_MODE:'disabled',STORAGE_ROOT:resolve(area,'objects'),STORAGE_PROVIDER:'local',LOG_LEVEL:'error'},stdio:'ignore'});children.push(child);
 try{
  const until=Date.now()+30000;let ready=false;
  while(Date.now()<until){try{const r=await fetch('http://127.0.0.1:'+port+'/health/db');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('Application not ready');
  const spec=await (await fetch('http://127.0.0.1:'+port+'/api/openapi.json')).json();if(spec.info.version!==version)throw Error('Application identity mismatch');
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('close',r));children.splice(children.indexOf(child),1);}
}
try{
 await db.connect();await db.query('CREATE DATABASE '+name);
 const target=new URL(url);target.pathname='/'+name;
 stage='migrations';run(process.execPath,['backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','backend/prisma/schema.prisma'],root,{...process.env,DATABASE_URL:target.toString()});
 const witness=new Client({connectionString:target.toString()});await witness.connect();
 try{
  await witness.query('CREATE TABLE rollback_probe (id integer PRIMARY KEY, value text NOT NULL)');await witness.query("INSERT INTO rollback_probe VALUES(1,'synthetic preserved data')");
  stage='extract-previous';const old=resolve(area,'old');mkdirSync(old);writeFileSync(resolve(area,'source.tar'),run('git',['archive',previous,'backend']));run('tar',['-xf',resolve(area,'source.tar'),'-C',old]);symlinkSync(resolve(root,'backend/node_modules'),resolve(old,'backend/node_modules'));
  stage='compile-previous';run(process.execPath,[resolve(root,'backend/node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],resolve(old,'backend'));
  const version=JSON.parse(run('git',['show',previous+':backend/package.json'])).version;
  const current=JSON.parse(run(process.execPath,['scripts/release.mjs','check'])).version;
  stage='probe-current';await probe(resolve(root,'backend/dist/server.js'),area,current,target.toString());
  stage='probe-previous';await probe(resolve(old,'backend/dist/server.js'),resolve(old,'backend'),version,target.toString());
  await probe(resolve(root,'backend/dist/server.js'),area,current,target.toString());
  const result=await witness.query('SELECT value FROM rollback_probe WHERE id=1');if(result.rows[0]?.value!=='synthetic preserved data')throw Error('Rollback lost data');
  console.log(JSON.stringify({rollback:'passed',previous,current,data:'preserved',production:'untouched'}));
 }finally{await witness.end();}
}catch{console.error('ROLLBACK_DRILL_FAILED: '+stage);process.exitCode=1;}
finally{for(const child of children)child.kill('SIGTERM');await db.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)').catch(()=>{});await db.end().catch(()=>{});rmSync(area,{recursive:true,force:true});}
