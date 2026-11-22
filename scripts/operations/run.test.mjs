import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runOperations} from './run.mjs';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',token='a'.repeat(64);
const options={baseUrl:'https://synthetic.invalid',maintenanceToken:token,monitoringToken:'b'.repeat(64),runId:id};
const response=data=>new Response(JSON.stringify({success:true,data}));
test('scheduler makes one bounded POST with a stable run ID and separately reads monitor status',async()=>{
 const calls=[];const result=await runOperations({...options,fetcher:async(url,init)=>{calls.push({path:url.pathname,...init});return init.method==='POST'?response({id,state:'SUCCEEDED'}):response({backend:{database:'ready',worker:'running'},waha:{status:'READY'}});}});
 assert.equal(result.maintenance,'succeeded');assert.equal(result.backend,'ready');assert.equal(result.waha,'ready');assert.equal(calls.length,2);assert.equal(calls[0].headers['X-Operations-Run'],id);assert.equal(calls[0].body,'{}');assert.ok(calls.every(c=>c.signal && c.redirect==='error'));
});
test('timeout/unknown POST is never retried and untrusted error bodies are not used as outcomes',async()=>{
 let calls=0;await assert.rejects(runOperations({...options,fetcher:async()=>{calls++;throw Error('network timeout');}}));assert.equal(calls,1);
 await assert.rejects(runOperations({...options,fetcher:async()=>new Response('private gateway body',{status:503})}),/OPERATIONS_UNAVAILABLE/);
 await assert.rejects(runOperations({...options,fetcher:async()=>response({id,state:'RUNNING'})}),/MAINTENANCE_NOT_CONFIRMED/);
});
test('independent monitor failures report only whitelisted status values',async()=>{
 let report;await assert.rejects(runOperations({...options,mode:'monitor',report:value=>report=value,fetcher:async()=>response({backend:{database:'private secret',worker:'running'},waha:{status:'READY',secret:'private secret'}})}),/MONITOR_DEGRADED/);
 assert.deepEqual(report,{maintenance:'not-requested',backend:'unavailable',waha:'ready'});assert.doesNotMatch(JSON.stringify(report),/private secret/);
});
test('scheduler refuses unsafe origins and missing credentials before any network call',async()=>{
 for(const baseUrl of ['http://localhost:8080','https://user:password@host.invalid','https://host.invalid/private?key=secret'])await assert.rejects(runOperations({...options,baseUrl}),/INVALID_CONFIGURATION/);
 await assert.rejects(runOperations({...options,maintenanceToken:''}),/MISSING_CONFIGURATION/);
});
