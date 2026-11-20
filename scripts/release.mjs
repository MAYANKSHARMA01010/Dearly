#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const save = (name, data) =>
  writeFileSync(resolve(root, name), JSON.stringify(data, null, 2) + '\n');
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const tagPattern = /^v(\d+\.\d+\.\d+)(?:-rc\.([1-9]\d*))?$/;
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function check(tag = process.env.RELEASE_TAG) {
  const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim(),
    app = read('frontend/app.json').expo;
  if (!semver.test(version) || app.version !== version)
    throw Error('App/VERSION mismatch.');
  for (const dir of ['frontend', 'backend']) {
    const p = read(dir + '/package.json'),
      lock = read(dir + '/package-lock.json');
    if (
      p.version !== version ||
      lock.version !== version ||
      lock.packages[''].version !== version
    )
      throw Error('Package/lock version mismatch.');
  }
  if (
    !Number.isSafeInteger(app.android.versionCode) ||
    app.android.versionCode < 1 ||
    !/^[1-9]\d*$/.test(app.ios.buildNumber ?? '')
  )
    throw Error('Native build numbers are required.');
  if (tag && (!tagPattern.test(tag) || tag.match(tagPattern)[1] !== version))
    throw Error('Release tag must match VERSION (optional -rc.N).');
  return {
    version,
    androidVersionCode: app.android.versionCode,
    iosBuildNumber: app.ios.buildNumber,
    package: app.android.package,
  };
}
function checkDeploy(base) {
  const current = check();
  if (!base || !/^[a-f0-9]{40}$/.test(base)) throw Error('An explicit previous commit is required.');
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', 'frontend/src', 'frontend/app.json', 'frontend/package.json', 'frontend/package-lock.json', 'backend/src', 'backend/functions', 'backend/prisma', 'backend/package.json', 'backend/package-lock.json', 'backend/Dockerfile', 'scripts'], {cwd:root,encoding:'utf8'}).trim();
  if (!changed) return {...current, runtimeChanged:false};
  const previous = execFileSync('git', ['show', `${base}:VERSION`], {cwd:root,encoding:'utf8'}).trim();
  if (!semver.test(previous)) throw Error('Previous release version is invalid.');
  const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);const n=x.findIndex((v,i)=>v!==y[i]);return n<0?0:x[n]-y[n];};
  const tags=execFileSync('git',['tag','--merged',base,'--list','v*'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const released=tags.map(t=>t.match(tagPattern)?.[1]).filter(v=>v && semver.test(v)).sort(compare).at(-1);
  // A pending release can receive fixes before publication; never reuse a
  // published version or move backwards from the previous source version.
  const baseline=released ?? previous;
  if(compare(current.version,previous)<0 || compare(current.version,baseline)<=0) throw Error('Runtime deployment changes require an increased MAJOR.MINOR.PATCH version. Prepare and publish the matching APK release.');
  return {...current,runtimeChanged:true,previousVersion:previous,releasedVersion:released??null};
}
function prepare(next) {
  const current = check();
  if (!semver.test(next ?? ''))
    throw Error('Use an explicit MAJOR.MINOR.PATCH version.');
  const a = current.version.split('.').map(Number),
    b = next.split('.').map(Number);
  let greater = false;
  for (let n = 0; n < 3; n++) {
    if (b[n] !== a[n]) {
      greater = b[n] > a[n];
      break;
    }
  }
  if (!greater) throw Error('The next version must increase.');
  const app = read('frontend/app.json');
  app.expo.version = next;
  app.expo.android.versionCode = current.androidVersionCode + 1;
  app.expo.ios.buildNumber = String(Number(current.iosBuildNumber) + 1);
  save('frontend/app.json', app);
  for (const dir of ['frontend', 'backend']) {
    const p = read(dir + '/package.json'),
      lock = read(dir + '/package-lock.json');
    p.version = next;
    lock.version = next;
    lock.packages[''].version = next;
    save(dir + '/package.json', p);
    save(dir + '/package-lock.json', lock);
  }
  writeFileSync(resolve(root, 'VERSION'), next + '\n');
  return check();
}
function pack(tag, input) {
  const metadata = check(tag);
  if (!input || !existsSync(input) || !input.endsWith('.apk'))
    throw Error('A verified local APK is required.');
  const sdk =
      process.env.ANDROID_HOME ?? resolve(homedir(), 'Library/Android/sdk'),
    tools = resolve(sdk, 'build-tools');
  const build = readdirSync(tools)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .find(
      (v) =>
        existsSync(resolve(tools, v, 'aapt')) &&
        existsSync(resolve(tools, v, 'apksigner')),
    );
  if (!build) throw Error('Android verification tools are required.');
  const badging = execFileSync(
      resolve(tools, build, 'aapt'),
      ['dump', 'badging', resolve(input)],
      { encoding: 'utf8' },
    ),
    identity = badging.match(
      /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/,
    );
  if (
    !identity ||
    identity[1] !== metadata.package ||
    Number(identity[2]) !== metadata.androidVersionCode ||
    identity[3] !== metadata.version ||
    !/^native-code:.*'arm64-v8a'/m.test(badging)
  )
    throw Error('APK package, native version or architecture mismatch.');
  const java =
    process.env.JAVA_HOME ??
    execFileSync('/usr/libexec/java_home', ['-v', '17'], {
      encoding: 'utf8',
    }).trim();
  execFileSync(resolve(tools, build, 'apksigner'), ['verify', resolve(input)], {
    env: { ...process.env, JAVA_HOME: java },
    stdio: 'pipe',
  });
  const changed = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      'HEAD',
      '--',
      'frontend',
      'backend',
      'scripts',
      'docs',
      '.github',
      'VERSION',
      'AGENTS.md',
      'README.md',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  const untracked = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      'frontend',
      'backend',
      'scripts',
      'docs',
      '.github',
      'VERSION',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  if (changed || untracked)
    throw Error('Commit release source before packaging.');
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  }).split('\n');
  if (
    tracked.some(
      (p) =>
        /(^|\/)(?:\.runtime|\.secrets|node_modules|artifacts)\/|(?:^|\/)credentials\.json$|\.(?:jks|keystore|apk|aab)$/.test(
          p,
        ) ||
        (/(^|\/)\.env(?:\.|$)/.test(p) &&
          !p.endsWith('.env.example') &&
          !p.endsWith('.env.production.example')),
    )
  )
    throw Error('Private/generated files are tracked; packaging refused.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    out = resolve(root, 'frontend/artifacts/releases', tag);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const apk = 'Dearly-' + tag + '-arm64.apk',
    source = 'Dearly-' + tag + '-source.zip';
  copyFileSync(resolve(input), resolve(out, apk));
  execFileSync(
    'git',
    [
      'archive',
      '--format=zip',
      '--prefix=Dearly-' + tag + '/',
      '-o',
      resolve(out, source),
      commit,
    ],
    { cwd: root },
  );
  const files = [apk, source].map((name) => ({
    name,
    sha256: hash(resolve(out, name)),
    bytes: readFileSync(resolve(out, name)).byteLength,
  }));
  const manifest = { ...metadata, tag, commit, files };
  writeFileSync(
    resolve(out, 'release.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  writeFileSync(
    resolve(out, 'SHA256SUMS'),
    [
      ...files,
      { name: 'release.json', sha256: hash(resolve(out, 'release.json')) },
    ]
      .map((x) => x.sha256 + '  ' + x.name)
      .join('\n') + '\n',
  );
  return { directory: out, tag, commit };
}
function verify(directory) {
  const out = resolve(directory),
    manifest = JSON.parse(readFileSync(resolve(out, 'release.json'), 'utf8'));
  check(manifest.tag);
  if (!Array.isArray(manifest.files) || manifest.files.length !== 2)
    throw Error('Invalid release manifest.');
  const expected = new Set([
    'Dearly-' + manifest.tag + '-arm64.apk',
    'Dearly-' + manifest.tag + '-source.zip',
  ]);
  for (const file of manifest.files)
    if (!expected.delete(file.name))
      throw Error('Unexpected release filename.');
  for (const item of manifest.files) {
    if (
      typeof item.name !== 'string' ||
      basename(item.name) !== item.name ||
      !/^[A-Za-z0-9._-]+$/.test(item.name) ||
      hash(resolve(out, item.name)) !== item.sha256 ||
      readFileSync(resolve(out, item.name)).length !== item.bytes
    )
      throw Error('Release checksum mismatch.');
  }
  const sums = readFileSync(resolve(out, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n');
  if (sums.length !== 3) throw Error('Invalid checksum list.');
  for (const line of sums) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/);
    if (
      !match ||
      basename(match[2]) !== match[2] ||
      hash(resolve(out, match[2])) !== match[1]
    )
      throw Error('Release checksum mismatch.');
  }
  return { verified: true, tag: manifest.tag, commit: manifest.commit };
}
try {
  const [command = 'check', a, b] = process.argv.slice(2);
  const result =
    command === 'check'
      ? check(a)
      : command === 'check-deploy'
        ? checkDeploy(a)
      : command === 'prepare'
        ? prepare(a)
        : command === 'package'
          ? pack(a, b)
          : command === 'verify'
            ? verify(a)
            : undefined;
  if (!result)
    throw Error(
      'Use check, check-deploy BASE_SHA, prepare VERSION, package TAG APK, or verify DIRECTORY.',
    );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Release operation failed.',
  );
  process.exitCode = 1;
}
