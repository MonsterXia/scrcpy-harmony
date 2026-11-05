import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

async function files(directory, extension) {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(file, extension))
    else if (entry.name.endsWith(extension)) result.push(file)
  }
  return result.sort()
}
// Java argument files avoid Windows command length limits and preserve spaces.
function quote(argument) { return '"' + argument.replaceAll('\\', '/').replaceAll('"', '\\"') + '"' }
export async function buildAndroidServer({ root, sdk, tools = '35.0.0', platform = '35', javaHome = process.env.JAVA_HOME,
  host = process.platform, run = (file, args) => execFileSync(file, args, { stdio: 'inherit' }) }) {
  const build = path.join(root, 'build/android-server')
  const classes = path.join(build, 'classes'), generated = path.join(build, 'gen')
  const source = path.join(root, 'vendor/scrcpy-server/server/src/main')
  const toolDirectory = path.join(sdk, 'build-tools', tools)
  const platformDirectory = path.join(sdk, 'platforms', 'android-' + platform)
  const androidJar = path.join(platformDirectory, 'android.jar')
  const executable = name => javaHome ? path.join(javaHome, 'bin', name + (host === 'win32' ? '.exe' : '')) : name
  await fs.mkdir(build, { recursive: true })
  await fs.rm(classes, { recursive: true, force: true }); await fs.rm(generated, { recursive: true, force: true })
  await fs.mkdir(classes, { recursive: true })
  await fs.mkdir(path.join(generated, 'com/genymobile/scrcpy'), { recursive: true })
  await fs.writeFile(path.join(generated, 'com/genymobile/scrcpy/BuildConfig.java'),
    'package com.genymobile.scrcpy; public final class BuildConfig { public static final boolean DEBUG=false; public static final String VERSION_NAME="3.3.3"; }\n')
  const aidl = path.join(toolDirectory, host === 'win32' ? 'aidl.exe' : 'aidl')
  for (const file of ['android/content/IOnPrimaryClipChangedListener.aidl', 'android/view/IDisplayWindowListener.aidl']) {
    const args = ['-o' + generated, '-I' + path.join(source, 'aidl')]
    if (file.includes('/view/')) args.push('-p', path.join(platformDirectory, 'framework.aidl'))
    run(aidl, [...args, path.join(source, 'aidl', file)])
  }
  const compileArgs = ['-encoding', 'UTF-8', '-bootclasspath', androidJar, '-cp',
    [path.join(toolDirectory, 'core-lambda-stubs.jar'), generated].join(host === 'win32' ? ';' : ':'),
    '-d', classes, '-source', '1.8', '-target', '1.8', ...await files(path.join(source, 'java'), '.java')]
  const javacArgs = path.join(build, 'javac.args')
  await fs.writeFile(javacArgs, compileArgs.map(quote).join('\n'))
  run(executable('javac'), ['@' + javacArgs])
  const output = path.join(build, 'classes.zip')
  await fs.rm(output, { force: true })
  const dexArgs = path.join(build, 'dex.args')
  await fs.writeFile(dexArgs, ['-cp', path.join(toolDirectory, 'lib/d8.jar'), 'com.android.tools.r8.D8',
    '--classpath', androidJar, '--output', output, ...await files(classes, '.class')].map(quote).join('\n'))
  run(executable('java'), ['@' + dexArgs])
  await fs.rename(output, path.join(build, 'scrcpy-server'))
  await fs.rm(classes, { recursive: true, force: true }); await fs.rm(generated, { recursive: true, force: true })
}
