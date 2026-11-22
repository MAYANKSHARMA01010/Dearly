import {execFileSync} from 'node:child_process';
import {releasePlan} from './plan.mjs';
const plan=releasePlan();
console.log(JSON.stringify(plan,null,2));
if(process.argv[2]==='--apply'){
 if(plan.kind==='none')throw Error('No runtime release is needed.');
 execFileSync(process.execPath,['scripts/release.mjs','prepare',plan.version],{stdio:'inherit'});
 console.log('Version prepared. Review and commit the source, push main, then run the local coordinator with the explicit RC tag.');
}
