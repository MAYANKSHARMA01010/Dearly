import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mediaAccess} from '../src/utils/mediaAccess';
import {InboxService} from '../src/services/inbox.service';
import {AttachmentService} from '../src/services/attachment.service';
import type {PrismaClient} from '@prisma/client';
import type {ObjectStore} from '../src/providers/storage/local.storage';
const row={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',state:'READY',sha256:'a'.repeat(64),bytes:32,mime:'image/png'};
test('media access metadata has a bounded lease and excludes storage paths',()=>{
 const result=mediaAccess({...row},1800000000000);
 assert.equal(Date.parse(result.expiresAt)-Date.parse(result.checkedAt),300000);
 assert.deepEqual(Object.keys(result).sort(),['bytes','checkedAt','expiresAt','id','mime','sha256']);
 for(const patch of [{state:'UPLOADING'},{sha256:null},{sha256:'bad'}])assert.throws(()=>mediaAccess({...row,...patch}));
});
test('media authorization verifies owner and READY state without downloading object bytes',async()=>{
 let owned=true,ready=true,lookups=0;
 const db={draftMessage:{async findFirst(){return owned?{status:'SCHEDULED'}:null;}},attachment:{async findFirst(){lookups++;return{...row,state:ready?'READY':'UPLOADED'};}}} as unknown as PrismaClient;
 const store=new Proxy({},{get(){assert.fail('Metadata access must not touch object storage');}}) as ObjectStore;
 const service=new AttachmentService(db,store);
 assert.equal((await service.access('owner','message',row.id)).sha256,row.sha256);
 ready=false;await assert.rejects(service.access('owner','message',row.id));owned=false;await assert.rejects(service.access('other','message',row.id));assert.equal(lookups,2);
});


test('recipient media checks keep delivery/ownership filters and never mark content opened',async()=>{
 let allowed=true;let seen:unknown;let mediaCalls=0;
 const db={async $queryRaw(){return[{now:new Date()}];},inboxItem:{async findFirst(input:unknown){seen=input;return allowed?{messageId:'message',message:{ownerId:'owner',attachments:[{id:row.id}]}}:null;}}} as unknown as PrismaClient;
 const media={async access(owner:string,message:string,id:string){mediaCalls++;assert.equal(owner,'owner');assert.equal(message,'message');assert.equal(id,row.id);return mediaAccess(row);}} as unknown as AttachmentService;
 const service=new InboxService(db,media);await service.access('recipient','inbox',row.id);
 const where=(seen as {where:{userId:string;deliveredAt:unknown;message:unknown;AND:unknown}}).where;
 assert.equal(where.userId,'recipient');assert.ok(where.deliveredAt);assert.ok(where.message);assert.ok(where.AND);
 await assert.rejects(service.access('recipient','inbox','other-attachment'));allowed=false;await assert.rejects(service.access('other','inbox',row.id));assert.equal(mediaCalls,1);
});
