import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api/client.js';
import { parseAttachment, validateSelection } from '../src/services/attachments/contracts.js';
import { completeUpload, createAttachmentService } from '../src/services/attachments/service.js';
const id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'; const draft = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const row = (state='PENDING') => ({id,name:'note.txt',mime:'text/plain',bytes:5,state,createdAt:'2026-11-16T00:00:00Z',expiresAt:'2026-11-17T00:00:00Z'});
const selection = {id,name:'note.txt',mime:'text/plain',bytes:5,uri:'private://local'};

test('attachment selection validates type limits, aliases and safe names', () => {
  assert.equal(validateSelection('../hello.txt',null,5).name,'..hello.txt');
  assert.equal(validateSelection('voice.m4a','audio/x-m4a',1024).mime,'audio/mp4');
  for (const [name,mime,size] of [['bad.html','text/html',10],['empty.txt','text/plain',0],['big.txt','text/plain',1048577],['large.mp4','video/mp4',52428801]]) assert.throws(()=>validateSelection(name,mime,size));
});
test('attachment parsing rejects unknown states/types, oversized files and malformed metadata', () => {
  assert.equal(parseAttachment(row()).id,id);
  for (const patch of [{state:'SENT'},{mime:'text/html'},{bytes:1048577},{id:'../escape'},{expiresAt:'invalid'},{name:'x'.repeat(121)}]) assert.throws(()=>parseAttachment({...row(),...patch}));
});
test('attachment service sends only reservation metadata and enforces owned draft addresses', async () => {
  const calls=[]; const api=createAttachmentService({request:async(path,options)=>{calls.push({path,options});return options?.method==='DELETE'?{id,deleted:true}:path.endsWith('/finalize')?row('READY'):row();}},draft);
  await api.reserve(selection); assert.deepEqual(JSON.parse(calls[0].options.body),{id,name:'note.txt',mime:'text/plain',bytes:5});
  assert.equal(calls[0].options.body.includes('private://'),false);
  await api.finalize(id); await api.remove(id); assert.equal(calls[2].options.method,'DELETE');
  assert.throws(()=>api.contentPath('invalid')); assert.throws(()=>createAttachmentService({request:async()=>{}},'invalid'));
});
test('uncertain uploaded result reconciles the same reservation instead of uploading a second copy', async () => {
  let state='PENDING';let uploads=0;const ids=[];
  const api={reserve:async(file)=>{ids.push(file.id);return row(state);},finalize:async()=>{state='READY';return row(state);}};
  const upload=async()=>{uploads++;state='UPLOADED';throw new ApiError('Unknown outcome','network');};
  await assert.rejects(completeUpload({api,selection,upload}));
  assert.equal((await completeUpload({api,selection,upload})).state,'READY');assert.equal(uploads,1);assert.deepEqual(ids,[id,id]);
});
test('active/expired uploads never overwrite bytes and ready reservations are idempotent', async () => {
  let uploads=0;let finalized=0;let state='UPLOADING';const api={reserve:async()=>row(state),finalize:async()=>{finalized++;return row('READY');}};
  const upload=async()=>{uploads++;};
  await assert.rejects(completeUpload({api,selection,upload})); assert.equal(uploads,0);
  state='READY';assert.equal((await completeUpload({api,selection,upload})).state,'READY');assert.equal(finalized,0);
});
test('a fresh transfer verifies server state after bytes and finalizes explicitly', async () => {
  let state='PENDING';let calls=0;const api={reserve:async()=>{calls++;return row(state);},finalize:async()=>{state='READY';return row(state);}};
  const ready=await completeUpload({api,selection,upload:async()=>{state='UPLOADED';}});assert.equal(ready.state,'READY');assert.equal(calls,2);
});
