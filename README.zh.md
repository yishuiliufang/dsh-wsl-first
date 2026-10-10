# dsh-wsl-first

让 DSH 的命令执行**优先走 WSL**。

这是一个 [DeepSeek Harness](https://github.com/deepseek-ai) 插件，只做一件事：发布一段带顺序的系统提示词段，告诉模型执行命令时**第一个该调用哪个工具**。装上它不改变任何能力 —— 改变的是模型的**选择**。

## 要解决的问题

DSH 跑在 Windows 上时，命令工具往往好几个同时注册着：基座自带的 `pwsh` 一直都在，`wsl` 由另一个插件提供，`dsh-ops` 还可能再装一个自带 bash。**没有任何地方写明偏好**，于是模型自己挑 —— 通常挑它最先学会的 `pwsh`。

这是**路由问题，不是能力问题**。该给的是一条偏好，不是一道禁令。

## 插件做了什么

它注册一个作用域内的 `systemPrompt` 段，顺序为 **3260** —— 紧跟 `dsh-ops` 在 3250–3252 发布的工具表之后。因此本插件对"先调哪个执行器"有最终发言权，同时不影响其他任何段。

渲染出来的内容：

```markdown
# Shell routing: wsl first

**For every command execution, call `wsl` as the first and default tool.**

| Task | Tool |
| --- | --- |
| Any command, build, git, pipeline, script, file listing, search | `wsl` |
| POSIX commands where WSL is unavailable | `bash` (fallback) |
| Windows-native only: registry, services, COM, cmdlets with no Linux equivalent | `pwsh` (last resort) |

## Rules

- `wsl` is the primary command executor. Reach for it first, every time.
- Use `pwsh` **only** when the task genuinely requires functionality no other available tool provides — and say why in the same reply.
- Never use `pwsh` merely because it appears first in a tool list, and never as a fallback when a `wsl` command fails: fix the command and retry there.
```

## 只宣传真实存在的工具

**没注册的工具，一个字都不会提。** 这一段在每次组装时针对该 agent 的**真实工具表**渲染。所以没装 `wsl` 的配置不会被忽悠去用 wsl —— 首选项会被丢弃，由备选顶上；如果一个配置内的工具都不可见，这一段就渲染成空字符串，从提示词里消失。

这点很重要：让模型去调用一个不存在的工具，只会换来一次自信的失败调用，**比什么都不说更糟**。

## 安装

```bash
npm install dsh-wsl-first
```

然后把它加进 DSH profile 的 `package.json` 里 `dsh.profile.bundles` 数组：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-wsl-first"]
    }
  }
}
```

`wsl` 工具本身需要 [dsh-wsl-tool](https://github.com/XINY11451/dsh-wsl)。本插件只做路由，**自己不注册任何工具**。

## 配置

每个字段都可选，可在 profile patch（`- id: wsl-first-routing` / `config:`）或环境变量里设置。**优先级：行配置 > 环境变量 > 内置默认值。**

| 字段 | 默认值 | 环境变量 | 含义 |
| --- | --- | --- | --- |
| `preferred` | `wsl` | `DSH_WSL_FIRST_PREFERRED` | 最先尝试的工具。 |
| `alternatives` | `['bash']` | `DSH_WSL_FIRST_ALTERNATIVES`（逗号分隔） | 首选项之后依次尝试的工具。 |
| `discouraged` | `['pwsh']` | `DSH_WSL_FIRST_DISCOURAGED`（逗号分隔） | 被压到"最后手段"的工具。 |
| `promptPolicy` | `true` | — | 是否发布这一段。 |
| `sectionOrder` | `3260` | — | 段的排序位置。 |
| `sectionName` | `dsh-wsl-first:shell-routing` | — | 段的稳定名称。 |
| `extraGuidance` | `''` | — | 追加到段末尾的额外文字。 |
| `labels` | 内置 | — | 表格里 `{工具: 任务描述}`。 |
| `requirePreferred` | `false` | — | 仅当 `preferred` 可见时才发布该段。 |

### 改成 bash 优先

```yaml
- id: wsl-first-routing
  config:
    preferred: bash
    alternatives: []
    discouraged: []
```

本插件本质是一个通用的执行器路由器，**`wsl` 只是它的默认值**。

### 它强制的两条规则

- **同一个工具出现在两个层级里 = 矛盾。** 既当执行器又当"最后手段"，这是配置错误，会直接抛错，而不是让某个静默的胜者决定。
- **`preferred` 在 `alternatives` 里重复出现 = 不算矛盾。** 那是冗余，而且当你把 `preferred` 指向 `bash` 时会自然发生，所以直接去重，而不是把一个合理配置判为失败。

## 它刻意不做的事

**它不隐藏、也不禁用任何工具。** 目标是让 `wsl` 被**优先选中**，而不是让 `pwsh` **变得不可用**。隐藏工具改变的是 agent **能做什么**；路由段改变的是它**默认先够哪个**，能力原封不动。

如果你要的是硬版本 —— 把 `pwsh` 从工具表里整个摘掉 —— 那是你自己 profile patch 的事：

```yaml
- id: pwsh-sandbox
  disabled: true
```

**先在活着的 loader 树里确认那一行的真实 id。** id 写错会静默失效，还可能连带弄坏整棵工具树。

## 测试

```bash
npm test
```

`test/smoke.mjs` 覆盖配置解析（优先级、校验、两条重叠规则）与渲染（层级排序、可见性过滤、标题不出现 `undefined` 的边界）。`test/mount.mjs` 用假的 Cordis context 跑 `index.js` 里**真实的 `apply`**，断言注册出来的段名、顺序与渲染文本。

被测的两个模块都是**纯函数** —— 这正是策略逻辑放在 `lib/` 而不放在 `index.js` 的原因。

## 兼容性

- 需要 DSH `>=0.1.7-rc.2`。
- 依赖 `systemPrompt` 服务（每个标准 DSH profile 都有）。
- 与平台无关：Windows 是它的动机场景，但路由器在任何平台都能用。

## 许可证

MIT
