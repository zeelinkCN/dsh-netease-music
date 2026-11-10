/**
 * 数据引擎（网易云 MCP 的 Python 侧）无感安装器。
 *
 * 用户从 DeepSeek Harness 安装本插件后，不需要敲任何命令：
 *   Host 激活时若检测不到 engine/.venv，就自动
 *     uv（或 python3.x）→ venv → pip install -e <cloud-music-mcp 仓库>
 *   并把过程通过 /netease-panel/api/setup/install/log 暴露给面板展示。
 *
 * 网络：沿用 Host 进程的环境变量（用户如果在系统层配了代理，pnpm/git/pip 都会走）。
 * 幂等：重复调用只会有一个在飞任务；已装好时直接返回 done。
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const REPO_URL = 'https://github.com/Code-MonkeyZhang/cloud-music-mcp.git'
const IS_WINDOWS = process.platform === 'win32'
const LOG_MAX = 400

export const ENGINE_REPO_DIR = 'cloud-music-mcp'

function findUv() {
  const explicit = process.env.DSH_NETEASE_UV
  if (explicit && existsSync(explicit)) return explicit
  const exe = IS_WINDOWS ? 'uv.exe' : 'uv'
  const candidates = IS_WINDOWS
    ? [
        join(process.env.USERPROFILE || homedir(), '.local', 'bin', exe),
        join(process.env.LOCALAPPDATA || '', 'Programs', 'uv', exe),
        join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', exe),
        join(homedir(), '.cargo', 'bin', exe),
      ]
    : [
        join(homedir(), '.local', 'bin', exe),
        join(homedir(), '.cargo', 'bin', exe),
        '/opt/homebrew/bin/uv',
        '/usr/local/bin/uv',
      ]
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate
  const which = spawnSync(IS_WINDOWS ? 'where' : 'which', ['uv'], { encoding: 'utf8' })
  const found = (which.stdout || '').split(/\r?\n/)[0].trim()
  if (found && existsSync(found)) return found
  return null
}

function findPython() {
  const explicit = process.env.DSH_NETEASE_SYSTEM_PYTHON
  if (explicit && existsSync(explicit)) return explicit
  const names = IS_WINDOWS
    ? ['python.exe', 'python3.exe', 'python', 'py']
    : ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']
  for (const name of names) {
    const probe = spawnSync(name, ['-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    })
    if (probe.status === 0) {
      const version = (probe.stdout || '').trim()
      const [major, minor] = version.split('.').map(Number)
      if (major === 3 && minor >= 10) return name
    }
  }
  return null
}

/**
 * @typedef {object} InstallerOptions
 * @property {string} engineDir         engine/cloud-music-mcp 目录
 * @property {string} pythonPath        目标解释器（engineDir/.venv/bin/python）
 * @property {string} dataDir           日志目录
 * @property {(line: string) => void} [onLog]
 */
export function createInstaller(options) {
  const { engineDir, pythonPath, dataDir } = options
  const logFile = join(dataDir, 'install.log')
  const repoDir = engineDir // engine/cloud-music-mcp 自身就是仓库根

  const state = {
    state: 'idle', // idle | running | done | failed
    phase: null, // uv | clone | venv | pip | done
    lines: [],
    error: null,
    startedAt: null,
    finishedAt: null,
  }

  let running = null
  let installVerified = null

  const push = (line) => {
    const text = String(line).replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+$/, '')
    if (!text) return
    const stamped = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${text}`
    state.lines.push(stamped)
    if (state.lines.length > LOG_MAX) state.lines.splice(0, state.lines.length - LOG_MAX)
    try {
      mkdirSync(dataDir, { recursive: true })
      if (existsSync(logFile) && statSync(logFile).size > 2 * 1024 * 1024) rmSync(logFile, { force: true })
      appendFileSync(logFile, `${stamped}\n`)
    } catch {
      /* 日志失败不影响安装 */
    }
    try {
      options.onLog?.(stamped)
    } catch {
      /* ignore */
    }
  }

  const hasInstallLayout = () => existsSync(pythonPath) && existsSync(join(repoDir, 'pyproject.toml'))

  // 文件存在只代表 clone/venv 做过；依赖安装中断时不能误判为可用。
  // 同一轮生命周期只同步探测一次，失败后的显式重试会重新探测并继续 pip。
  const isInstalled = () => {
    if (!hasInstallLayout()) {
      installVerified = null
      return false
    }
    if (installVerified !== null) return installVerified
    const probe = spawnSync(
      pythonPath,
      ['-c', 'import pyncm, qrcode'],
      {
        cwd: repoDir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        encoding: 'utf8',
        timeout: 15_000,
      },
    )
    installVerified = probe.status === 0
    return installVerified
  }

  const snapshot = () => ({
    state: state.state,
    phase: state.phase,
    lines: state.lines.slice(-160),
    error: state.error,
    installed: isInstalled(),
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
  })

  const run = (command, args, cwd, label) => {
    return new Promise((resolve, reject) => {
      push(`$ ${label || [command, ...args].join(' ')}`)
      let child
      try {
        child = spawn(command, args, {
          cwd,
          env: { ...process.env, PYTHONUNBUFFERED: '1', GIT_TERMINAL_PROMPT: '0' },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        reject(new Error(`无法启动 ${command}：${err?.message ?? err}`))
        return
      }
      const onChunk = (chunk) => {
        const text = String(chunk)
        for (const line of text.split(/[\r\n]+/)) if (line.trim()) push(line)
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', onChunk)
      child.stderr.on('data', onChunk)
      child.on('error', (err) => reject(new Error(`${command} 启动失败：${err?.message ?? err}`)))
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`${label || command} 退出码 ${code}`))
      })
    })
  }

  async function execute() {
    installVerified = false
    state.state = 'running'
    state.error = null
    state.lines = []
    state.startedAt = Date.now()
    state.finishedAt = null
    push('开始安装网易云数据引擎（cloud-music-mcp）…')

    const uv = findUv()
    const systemPython = findPython()
    if (!uv && !systemPython) {
      throw new Error(
        '本机没有找到 uv 或 Python 3.10+，无法自动安装引擎。请先安装 uv（https://astral.sh/uv）后点「重试」。',
      )
    }

    mkdirSync(engineDir, { recursive: true })
    const needsClone = !existsSync(join(repoDir, 'pyproject.toml'))
    if (needsClone) {
      state.phase = 'clone'
      push(`克隆上游 MCP 仓库：${REPO_URL}`)
      const parent = join(engineDir, '..')
      mkdirSync(parent, { recursive: true })
      if (existsSync(repoDir)) {
        // 目录存在但内容不完整（例如上次中断），清掉重来
        rmSync(repoDir, { recursive: true, force: true })
      }
      await run('git', ['clone', '--depth', '1', REPO_URL, ENGINE_REPO_DIR], parent, 'git clone cloud-music-mcp')
    } else {
      push('已检测到 cloud-music-mcp 源码，跳过 clone')
    }

    state.phase = 'venv'
    if (!existsSync(pythonPath)) {
      if (uv) {
        push(`使用 uv 创建 venv：${uv}`)
        // uv 的 --python 取值跨平台不同：先试具体版本，再退到平台默认可执行名
        const selectors = IS_WINDOWS ? ['3.12', 'python', 'python3'] : ['3.12', 'python3']
        let created = false
        for (const selector of selectors) {
          try {
            await run(uv, ['venv', '--python', selector, '.venv'], repoDir, `uv venv --python ${selector}`)
            created = true
            break
          } catch (err) {
            push(`--python ${selector} 不可用，继续尝试下一个`)
          }
        }
        if (!created) await run(uv, ['venv', '.venv'], repoDir, 'uv venv')
      } else {
        push(`使用系统 Python 创建 venv：${systemPython}`)
        await run(systemPython, ['-m', 'venv', '.venv'], repoDir, 'python -m venv')
      }
    } else {
      push('已存在 .venv，跳过创建')
    }

    state.phase = 'pip'
    if (uv) {
      await run(uv, ['pip', 'install', '-p', pythonPath, '-e', '.'], repoDir, 'uv pip install -e .')
    } else {
      const pip = join(repoDir, '.venv', IS_WINDOWS ? 'Scripts' : 'bin', IS_WINDOWS ? 'pip.exe' : 'pip')
      await run(pip, ['install', '--upgrade', 'pip'], repoDir, 'pip install --upgrade pip')
      await run(pip, ['install', '-e', '.'], repoDir, 'pip install -e .')
    }

    // 冒烟：真正 import 一次 pyncm / qrcode，确认引擎可用
    state.phase = 'verify'
    push('校验引擎依赖…')
    await run(pythonPath, ['-c', 'import pyncm, qrcode; print("pyncm", getattr(pyncm, "__version__", "?"))'], repoDir, 'import pyncm')
    installVerified = true

    state.phase = 'done'
    state.state = 'done'
    state.finishedAt = Date.now()
    push('引擎安装完成 ✔ 正在连接网易云…')
    return snapshot()
  }

  function start() {
    if (running) return running
    if (state.state === 'failed') installVerified = null
    if (isInstalled()) {
      state.state = 'done'
      state.installed = true
      state.finishedAt = state.finishedAt ?? Date.now()
      return Promise.resolve(snapshot())
    }
    running = execute()
      .catch((err) => {
        state.state = 'failed'
        state.phase = 'failed'
        state.error = String(err?.message ?? err)
        push(`安装失败：${state.error}`)
        return snapshot()
      })
      .finally(() => {
        running = null
      })
    return running
  }

  return {
    start,
    snapshot,
    isInstalled,
    readLog: () => {
      try {
        return readFileSync(logFile, 'utf8')
      } catch {
        return state.lines.join('\n')
      }
    },
  }
}
