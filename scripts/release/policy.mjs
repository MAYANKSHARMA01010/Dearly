import {createHash} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function propose(base, commits){
 if(!/^\d+\.\d+\.\d+$/.test(base))throw Error('INVALID_BASE_VERSION');
 const runtime=commits.filter(c=>c.runtime);
 const breaking=runtime.some(c=>/^[a-z]+(?:\([^\n)]+\))?!:|^BREAKING[ -]CHANGE:/m.test(c.message));
 const kind=!runtime.length?'none':breaking?'major':runtime.some(c=>/^feat(?:\([^\n)]+\))?:/.test(c.message))?'minor':'patch';
 const v=base.split('.').map(Number);
 if(kind==='major'){v[0]++;v[1]=v[2]=0;}else if(kind==='minor'){v[1]++;v[2]=0;}else if(kind==='patch')v[2]++;
 return {kind,version:v.join('.'),changes:runtime.map(c=>({commit:c.sha,subject:c.message.split('\n')[0]}))};
}
export function validateMigrations(local,applied){
 const known=new Map(local.map(m=>[m.name,m.checksum]));
 const done=new Set();
 for(const row of applied){
  if(row.rolled_back_at)continue;
  if(!row.finished_at || !known.has(row.migration_name) || known.get(row.migration_name)!==row.checksum)throw Error('MIGRATION_REVIEW_REQUIRED');
  done.add(row.migration_name);
 }
 if(local.some(m=>!done.has(m.name)))throw Error('MIGRATION_REVIEW_REQUIRED');
 return sha256(JSON.stringify(local));
}
export function deploymentReady(data,expected){
 return data?.release?.commit===expected.commit && data.release.version===expected.version && data.release.migrations===expected.migrations && data.backend?.database==='ready' && data.backend.worker==='running' && data.backend.queueHealthy===true && data.waha?.status==='READY';
}
export function ciReady(runs,commit){
 return runs.some(r=>r.headSha===commit && r.headBranch==='main' && r.event==='push' && r.status==='completed' && r.conclusion==='success');
}
/** Persist running state before effects. Completed stages are never replayed. */
export async function advance(state,name,work,save){
 if(state.completed.includes(name))return;
 state.stage=name;await save();
 await work();state.completed.push(name);await save();
}
export function tagMatches(refs,commit){
 const lines=refs.trim().split('\n').filter(Boolean).map(line=>line.split(/\s+/));
 if(!lines.length)return true;
 const peeled=lines.find(row=>row[1]?.endsWith('^{}'));
 return (peeled??lines[0])[0]===commit;
}
