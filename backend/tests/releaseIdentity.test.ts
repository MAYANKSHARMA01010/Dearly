import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseIdentity} from '../src/services/releaseIdentity.service';
test('protected release identity returns only validated public commit/version and migration digest',()=>{
 const before=process.env.RENDER_GIT_COMMIT;
 try{
  process.env.RENDER_GIT_COMMIT='postgresql://private:not-a-commit';
  const invalid=releaseIdentity();assert.equal(invalid.commit,null);assert.match(invalid.migrations,/^[a-f0-9]{64}$/);
  process.env.RENDER_GIT_COMMIT='a'.repeat(40);
  assert.deepEqual(releaseIdentity(),{...invalid,commit:'a'.repeat(40)});
  assert.deepEqual(Object.keys(invalid).sort(),['commit','migrations','version']);
 }finally{if(before===undefined)delete process.env.RENDER_GIT_COMMIT;else process.env.RENDER_GIT_COMMIT=before;}
});
