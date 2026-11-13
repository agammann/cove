import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import publish from './release.mjs';

// These clients and release objects are entirely in memory.
export async function verifyActionCompatibility() {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const sha = 'a'.repeat(40);
  const context = { eventName: 'push', ref: 'refs/heads/main', sha,
    repo: { owner: 'fixture', repo: 'fixture' } };
  const messages = [];
  const core = { info: message => messages.push(message) };
  const noWrite = { rest: { repos: { listReleases() {} } },
    paginate: async () => [{ tag_name: 'v' + version, draft: false }] };
  await publish({ github: noWrite, context, core });
  assert.ok(messages.some(message => message.includes('already published; leaving it unchanged')));
  await assert.rejects(publish({ github: noWrite, context: { ...context, eventName: 'pull_request' }, core }));

  let release = null;
  let tag = null;
  const assets = [];
  const repos = {
    listReleases() {}, listReleaseAssets() {},
    createRelease: async args => ({ data: (release = { ...args, id: 1 }) }),
    getRelease: async () => ({ data: release }),
    updateRelease: async args => ({ data: (release = { ...release, ...args }) }),
    uploadReleaseAsset: async args => {
      const asset = { name: args.name, state: 'uploaded', size: args.data.length,
        digest: 'sha256:' + crypto.createHash('sha256').update(args.data).digest('hex') };
      assets.push(asset);
      return { data: asset };
    },
  };
  const git = {
    getRef: async () => {
      if (!tag) throw Object.assign(new Error('fixture tag missing'), { status: 404 });
      return { data: { object: { type: 'commit', sha: tag } } };
    },
    createRef: async args => { tag = args.sha; },
  };
  const github = { rest: { repos, git }, paginate: async method => {
    if (method === repos.listReleases) return release ? [release] : [];
    if (method === repos.listReleaseAssets) return assets;
    throw new Error('Unexpected fixture pagination call');
  } };
  tag = 'b'.repeat(40);
  await assert.rejects(publish({ github, context, core }), /different commit/);
  assert.equal(release, null);
  tag = null;
  await publish({ github, context, core });
  assert.equal(tag, sha);
  assert.equal(release.draft, false);
  const byName = (a, b) => a.localeCompare(b);
  assert.deepEqual(assets.map(asset => asset.name).sort(byName),
    ['SHA256SUMS', `cove_${version}_source.zip`, `cove_${version}_source.zip.sha256`].sort(byName));
}

