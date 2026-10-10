# dsh-wsl-first

[English](README.md) | **中文**

让 DSH 在 Windows 上优先用 WSL 执行命令。

🎯 装了 WSL 就先用 WSL，别让模型默认去写 PowerShell。

## 理念

DSH 在 Windows 上给模型的默认命令工具是 pwsh。这本身没什么问题，但如果机器上已经装了 WSL，这个默认就有点亏。

模型写 bash 比写 PowerShell 顺手，它的命令习惯基本是 POSIX 那一套。硬切到 PowerShell，就得在管道、转义、路径之间来回换算，换算错了还得重来一遍。**每多一次重试，就是白烧掉的 token。**

输出也是一样。Linux 那边的命令输出大多紧凑；PowerShell 默认给你带表格、带对象属性，同样的信息占的地方明显更大。

路径同理。WSL 工具会自动把 `C:\...` 转成 `/mnt/c/...`，不需要模型自己操心。

所以这个插件做的事情很简单：往系统提示词里加一段，写明执行命令先找 `wsl`。**不加能力、不禁用工具，只是把默认顺序调过来。**

那段提示词里只列真实注册了的工具。哪个工具没装，里面就不会出现它，也就不会出现"让模型去用一个不存在的工具"这种事。静态的指令文件做不到这点，它只会照抄。

## 特性

- 🚀 省 token  少一次语法换算，就少一次重试
- 🐧 对准 WSL  模型按 bash 来写，直接跑在 Linux 侧，真需要 Windows 原生功能时，pwsh 还在工具表里

## 依赖

-| **DSH** | `>=0.1.7-rc.2` |
-| **必需服务** | `systemPrompt`，标准 profile 都自带 |
-| **必需插件** | [dsh-wsl-tool](https://github.com/XINY11451/dsh-wsl)，提供 `wsl` / `wsl-path` / `wsl-env` / `wsl-doctor` |
-| **WSL** | WSL2，至少一个已注册的发行版，`wsl.exe` 在 PATH 上 |
-| **平台** | 推荐 Windows  |

本插件自己不注册任何工具，只在别的插件提供的工具之间做路由。没有 `dsh-wsl-tool` 就没有 `wsl` 可首选，那段提示词会渲染成空。

## 安装

```bash
npm install dsh-wsl-first
```

装完加进 profile 的 `package.json`：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-wsl-first"]
    }
  }
}
```

bundle 自带 `cordis.patch.yml`，会把这个路由行进程级插进去，每个 agent preset 都能拿到这段提示词，不用各自声明。**需要重启 profile**，loader 在启动时读组合配置。

如果 `wsl` 工具本身还没装，先装它：

```bash
npm install dsh-wsl-tool
```

## DSH 版本兼容

`package.json` 里声明了 `engines.dsh: ">=0.1.7-rc.2"`。

本插件**没有声明任何 `@deepseek-ai/*` peer dependency**，也不 import 它们的值。这是一条刻意的设计：DSH 启动时会用 `evaluatePluginCompatibility` 逐个校验 profile bundle 的 peer 区间，只要有一个不覆盖当前运行时版本，**整个 bundle 会被跳过**，`cordis.patch.yml` 不生效，表现就是"插件装了但没反应"。本插件没有任何 peer 区间可校验，也就不会因为这种原因被跳过。

升级 DSH 大版本后如果本插件突然没了动静，先看 stderr 有没有 `skipping profile bundle` 字样，再查 `engines.dsh` 是否还覆盖。

## 配置

每个字段都可选，写在 profile patch（`- id: wsl-first-routing` / `config:`）或环境变量里。**优先级：行配置 > 环境变量 > 内置默认值。**

| 字段 | 默认值 | 环境变量 | 说明 |
| --- | --- | --- | --- |
| `preferred` | `wsl` | `DSH_WSL_FIRST_PREFERRED` | 最先尝试的工具 |
| `alternatives` | `['bash']` | `DSH_WSL_FIRST_ALTERNATIVES` | 首选项之后依次尝试（逗号分隔） |
| `discouraged` | `['pwsh']` | `DSH_WSL_FIRST_DISCOURAGED` | 压到"最后手段"的工具（逗号分隔） |
| `promptPolicy` | `true` | — | 是否发布这一段 |
| `sectionOrder` | `3260` | — | 段的排序位置 |
| `sectionName` | `dsh-wsl-first:shell-routing` | — | 段的稳定名称 |
| `extraGuidance` | `''` | — | 追加到段末尾的额外文字 |
| `labels` | 内置 | — | 表格里 `{工具: 任务描述}` |
| `requirePreferred` | `false` | — | 仅当 `preferred` 可见时才发布 |

### 只提 wsl，别的都不要

```yaml
- id: wsl-first-routing
  config:
    preferred: wsl
    alternatives: []
    discouraged: []
```

这样那段只写 `wsl`，在没装 `wsl` 的环境里干脆不出现。

### 改成 bash 优先

```yaml
- id: wsl-first-routing
  config:
    preferred: bash
    alternatives: []
    discouraged: []
```

`wsl` 只是默认值，这插件本质是个通用的执行器路由器。

### 两条配置规则

同一个工具既当执行器又当"最后手段"是矛盾，会直接报错，不让某个静默的胜者决定。而 `preferred` 在 `alternatives` 里重复出现不算矛盾，那只是冗余（把 `preferred` 指到 `bash` 时会自然发生），直接去重。

## 渲染出来的提示词

```markdown
# Shell routing: wsl first

**For every command execution, call `wsl` as the first and default tool.**

| Task | Tool |
| --- | --- |
| Any command, build, git, pipeline, script, file listing, search | `wsl` |
| Windows-native only: registry, services, COM, cmdlets with no Linux equivalent | `pwsh` (last resort) |

## Rules

- `wsl` is the primary command executor. Reach for it first, every time.
- Use `pwsh` **only** when the task genuinely requires functionality no other available tool provides — and say why in the same reply.
- Never use `pwsh` merely because it appears first in a tool list, and never as a fallback when a `wsl` command fails: fix the command and retry there.
- Do not mix shell syntaxes. A `wsl` call contains the syntax of the shell that tool runs; each executor has its own quoting and path rules.
- `wsl` paths are Linux paths (`/mnt/c/...`). Windows paths in `command`/`workdir` are translated automatically; pass `translatePaths: false` to hand a native path to a Windows program.
```

上面这份是从真实会话的系统提示词里读回来的。注意里面**没有** `bash` 那一行：在实测的那个 profile 里 `bash` 工具没注册，路由器就把它去掉了。

## 项目结构

```
dsh-wsl-first
├── index.js          # Host 端插件：注册 systemPrompt 段
├── lib/
│   ├── config.js     # 配置解析、优先级、校验
│   └── policy.js     # 层级排序与提示词渲染
├── test/
│   ├── smoke.mjs     # 配置与渲染（27 项）
│   ├── mount.mjs     # 真实 apply() 挂载（8 项）
│   └── docs.mjs      # 断言两份 README 引用的是真实渲染（3 项）
├── cordis.patch.yml  # bundle 层：进程级插入路由行
├── dsh-plugin.json   # 插件清单
└── package.json
```

## 测试

```bash
npm test
```

`lib/` 下两个模块都是纯函数，所以测试不需要 DSH 宿主。`mount.mjs` 用假的 cordis context 跑 `index.js` 里真实的 `apply`，断言注册出的段名、顺序和渲染文本。`docs.mjs` 重新渲染一次，逐字节比对两份 README 里引用的那段，所以文档里的输出不可能和代码实际产出脱节。

## 许可证

MIT
