import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const ROOT = new URL('..', import.meta.url)
const source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
let passed = 0

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

function extract(start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `cannot extract ${start}`)
  return source.slice(from, to)
}

await test('cache clear invalidates pending factories and permits a new account request', async () => {
  const code = `${extract('function createCache()', '/* ------------------------------------------------------------------ *\n * 播放器状态上报')}\nglobalThis.createCache = createCache`
  const context = { Date, Map, Promise }
  vm.runInNewContext(code, context)
  const cache = context.createCache()
  let resolveOld
  let newFetches = 0
  const old = cache.wrap('home', 60_000, () => new Promise((resolve) => { resolveOld = resolve }))
  await Promise.resolve()
  cache.clear()
  const fresh = cache.wrap('home', 60_000, async () => {
    newFetches += 1
    return { account: 'B' }
  })
  resolveOld({ account: 'A' })
  assert.deepEqual(await fresh, { account: 'B' })
  assert.deepEqual(await old, { account: 'A' })
  assert.equal(newFetches, 1)
  assert.deepEqual(await cache.wrap('home', 60_000, async () => ({ account: 'C' })), { account: 'B' })
})

await test('an old engine exit cannot erase a ready replacement engine', async () => {
  const children = []
  class FakeStream extends EventEmitter {
    setEncoding() {}
    write() { return true }
    end() {}
  }
  class FakeChild extends EventEmitter {
    constructor() {
      super()
      this.stdout = new FakeStream()
      this.stderr = new FakeStream()
      this.stdin = new FakeStream()
      this.killed = false
    }
    kill() { this.killed = true; return true }
  }
  const context = {
    EventEmitter,
    existsSync: () => true,
    spawn: () => {
      const child = new FakeChild()
      children.push(child)
      return child
    },
    join: (...parts) => parts.join('/'),
    ROOT: '/plugin',
    ERR_ENGINE_MISSING: 'missing',
    log: () => {},
    setTimeout,
    clearTimeout,
    process: { env: {} },
    console,
  }
  const pluginError = extract('class PluginError', '/* ------------------------------------------------------------------ *\n * Python 引擎')
  const bridge = extract('class Bridge', '/* ------------------------------------------------------------------ *\n * 缓存')
  vm.runInNewContext(`${pluginError}\n${bridge}\nglobalThis.Bridge = Bridge`, context)
  const instance = new context.Bridge({ python: '/python', script: '/bridge.py', cookieFile: '/cookie' })
  const firstStart = instance.start()
  const first = children[0]
  first.stdout.emit('data', '{"event":"ready","data":{}}\n')
  await firstStart
  instance.stop()
  const secondStart = instance.start()
  const second = children[1]
  second.stdout.emit('data', '{"event":"ready","data":{}}\n')
  await secondStart
  assert.equal(instance.child, second)
  assert.equal(instance.alive, true)
  first.emit('exit', 0, null)
  assert.equal(instance.child, second)
  assert.equal(instance.alive, true)
  instance.stop()
})

await test('engine readiness follows verified installation, not python file presence', async () => {
  const code = `${extract('  const engineState =', '  let loginKey')}\nglobalThis.engineState = engineState`
  const context = {}
  vm.runInNewContext(code, context)
  assert.equal(context.engineState({ installed: false, state: 'failed' }), 'failed')
  assert.equal(context.engineState({ installed: false, state: 'running' }), 'installing')
  assert.equal(context.engineState({ installed: false, state: 'idle' }), 'missing')
  assert.equal(context.engineState({ installed: true, state: 'failed' }), 'installed')
})

await test('failed dependency install is retried instead of being reported done', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'netease-installer-regression-'))
  const engineDir = join(dir, 'engine')
  const dataDir = join(dir, 'data')
  const pythonPath = join(engineDir, '.venv', 'bin', 'python')
  const uvPath = join(dir, 'fake-uv')
  const marker = join(dir, 'installed')
  const counter = join(dir, 'pip-count')
  try {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(engineDir, '.venv', 'bin'), { recursive: true }))
    await writeFile(join(engineDir, 'pyproject.toml'), '[project]\nname="fixture"\n')
    await writeFile(pythonPath, `#!/bin/sh\n[ -f "${marker}" ] && exit 0\nexit 1\n`)
    await chmod(pythonPath, 0o755)
    await writeFile(uvPath, `#!/bin/sh\nn=0\n[ -f "${counter}" ] && n=$(cat "${counter}")\nn=$((n+1))\necho "$n" > "${counter}"\nif [ "$n" -eq 1 ]; then exit 1; fi\ntouch "${marker}"\nexit 0\n`)
    await chmod(uvPath, 0o755)

    const previousUv = process.env.DSH_NETEASE_UV
    process.env.DSH_NETEASE_UV = uvPath
    try {
      const moduleUrl = new URL(`../server/installer.mjs?regression=${Date.now()}`, import.meta.url)
      const { createInstaller } = await import(moduleUrl)
      const installer = createInstaller({ engineDir, pythonPath, dataDir })
      const first = await installer.start()
      assert.equal(first.state, 'failed')
      assert.equal(first.installed, false)
      const second = await installer.start()
      assert.equal(second.state, 'done')
      assert.equal(second.installed, true)
      assert.equal((await readFile(counter, 'utf8')).trim(), '2')
    } finally {
      if (previousUv === undefined) delete process.env.DSH_NETEASE_UV
      else process.env.DSH_NETEASE_UV = previousUv
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

console.log(`HOST REGRESSION PASS ${passed}/4`)
