import assert from 'node:assert/strict'

export function assertInstalledClient(pkg, version, tools, schema) {
  assert.equal(pkg.name, 'scrcpy-plus-cli')
  assert.equal(pkg.version, version)
  assert.deepEqual(pkg.bin, { 'scrcpy-plus': 'index.cjs', 'scrcpy-plus-mcp': 'mcp.cjs' })
  const expected = Object.keys(schema.operations).map(name => name.replace(/[.-]/g, '_')).sort()
  assert.equal(expected.length, 35, 'Unexpected protocol v1 operation count')
  assert.deepEqual(tools.map(tool => tool.name).sort(), expected, 'Installed MCP tool set differs from CLI schema')
}
