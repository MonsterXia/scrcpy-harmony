const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const yaml = require('js-yaml')
test('publication cancellation still attempts bounded audit upload with time reserved', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/build.yml', 'utf8'))
  const job = workflow.jobs.publish
  const publish = job.steps.find(s => s.run === 'python -B script/dev-release/operate.py')
  const audit = job.steps.find(s => s.with?.name === 'dev2-publication-audit')
  assert.equal(audit.if, '${{ always() }}')
  assert.ok(publish['timeout-minutes'] > 0)
  assert.ok(audit['timeout-minutes'] > 0)
  assert.ok(publish['timeout-minutes'] + audit['timeout-minutes'] < job['timeout-minutes'])
})
