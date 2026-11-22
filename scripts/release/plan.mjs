import {execFileSync} from 'node:child_process';
import {propose} from './policy.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function releasePlan(){
 const tags=git('tag','--merged','HEAD','--sort=-version:refname','--list','v*').split('\n').filter(t=>/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(t));
 const published=JSON.parse(execFileSync('gh',['release','list','--limit','100','--json','tagName,isDraft'],{encoding:'utf8'})).filter(r=>!r.isDraft).map(r=>r.tagName);
 const tag=tags.find(t=>published.includes(t));if(!tag)throw Error('PUBLISHED_BASE_REQUIRED');
 const hashes=git('rev-list','--reverse',tag+'..HEAD').split('\n').filter(Boolean);
 const commits=hashes.map(sha=>({sha,message:git('show','-s','--format=%B',sha),runtime:!!git('diff-tree','--no-commit-id','--name-only','-r',sha,'--','backend/src','backend/prisma','backend/functions','backend/Dockerfile','backend/package.json','frontend/src','frontend/app.json','frontend/package.json','scripts','.github/workflows').trim()}));
 const p=propose(tag.match(/^v(\d+\.\d+\.\d+)/)[1],commits);
 return {baseTag:tag,head:git('rev-parse','HEAD'),...p};
}
if(import.meta.url===new URL(process.argv[1],'file:').href)console.log(JSON.stringify(releasePlan(),null,2));
