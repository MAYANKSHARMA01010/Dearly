import {test} from 'node:test';
import assert from 'node:assert/strict';
import {propose,validateMigrations,deploymentReady,ciReady,sha256} from './policy.mjs';
const change=(message,runtime=true)=>({sha:'a'.repeat(40),message,runtime});
test('semantic proposals distinguish docs, compatible fixes/features and explicit breaking markers',()=>{
 assert.equal(propose('1.5.0',[change('docs: update',false)]).kind,'none');
 assert.equal(propose('1.5.0',[change('fix(auth): correct timeout')]).version,'1.5.1');
 assert.equal(propose('1.5.0',[change('feat(release): coordinate publication')]).version,'1.6.0');
 for(const message of ['feat(api)!: change contract','fix: revise\n\nBREAKING CHANGE: new contract','chore: adjust\n\nBREAKING-CHANGE: incompatible'])assert.equal(propose('1.5.0',[change(message)]).version,'2.0.0');
 assert.equal(propose('1.5.0',[change('docs!: words',false)]).kind,'none');
});
test('migration gate blocks unfinished, missing, unknown and modified migrations without applying SQL',()=>{
 const local=[{name:'20261122060000_operations_journal',checksum:sha256('synthetic SQL')}];
 const row={migration_name:local[0].name,checksum:local[0].checksum,finished_at:new Date(),rolled_back_at:null};
 assert.match(validateMigrations(local,[row]),/^[a-f0-9]{64}$/);
 for(const rows of [[],[{...row,finished_at:null}],[{...row,checksum:'tampered'}],[{...row,migration_name:'unknown'}],[{...row,rolled_back_at:new Date()}]])assert.throws(()=>validateMigrations(local,rows),/MIGRATION_REVIEW_REQUIRED/);
});
test('only successful push CI on the exact main commit unlocks signing',()=>{
 const sha='a'.repeat(40),good={headSha:sha,headBranch:'main',event:'push',status:'completed',conclusion:'success'};
 assert.equal(ciReady([good],sha),true);
 for(const override of [{headSha:'b'.repeat(40)},{headBranch:'feature'},{event:'pull_request'},{conclusion:'failure'},{status:'in_progress'}])assert.equal(ciReady([{...good,...override}],sha),false);
});
test('publication gate requires exact deployment identity, schema digest, database, worker, queue and WAHA',()=>{
 const expected={commit:'a'.repeat(40),version:'1.6.0',migrations:'b'.repeat(64)};
 const data={release:expected,backend:{database:'ready',worker:'running',queueHealthy:true},waha:{status:'READY'}};
 assert.equal(deploymentReady(data,expected),true);
 for(const patch of [{release:{...expected,commit:null}},{release:{...expected,version:'1.5.0'}},{release:{...expected,migrations:'changed'}},{backend:{...data.backend,queueHealthy:false}},{backend:{...data.backend,worker:'offline'}},{waha:{status:'UNAVAILABLE'}}])assert.equal(deploymentReady({...data,...patch},expected),false);
});

test('failed gates stop later effects; resume preserves completed stages and records uncertainty',async()=>{
 const {advance}=await import('./policy.mjs');
 const state={completed:[],stage:'STARTED'},effects=[],journal=[];
 const save=()=>journal.push(JSON.parse(JSON.stringify(state)));
 async function scenario(fail){
  await advance(state,'CI',async()=>effects.push('CI'),save);
  await advance(state,'BUILD',async()=>{effects.push('BUILD');if(fail)throw Error('build unavailable');},save);
  await advance(state,'DEPLOY',async()=>effects.push('DEPLOY'),save);
  await advance(state,'PUBLISH',async()=>effects.push('PUBLISH'),save);
 }
 await assert.rejects(scenario(true));assert.deepEqual(effects,['CI','BUILD']);
 assert.equal(state.stage,'BUILD');assert.deepEqual(state.completed,['CI']);
 await scenario(false);assert.deepEqual(effects,['CI','BUILD','BUILD','DEPLOY','PUBLISH']);
 assert.ok(journal.some(j=>j.stage==='DEPLOY'&&!j.completed.includes('DEPLOY')));
 await scenario(false);assert.equal(effects.length,5);
});
