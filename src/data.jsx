// data.jsx — static display metadata for real Tauri data

const ITEM_META = {
  'openclaw': {
    name: 'OpenClaw',
    type: 'ai-gateway',
    risk: 'medium',
    desc: 'Anthropic 兼容网关',
    repo: 'npm: openclaw',
  },
  'webclaw-dashboard-server': {
    name: 'WebClaw Dashboard Server',
    type: 'gateway',
    risk: 'high',
    desc: '面板后端服务',
    repo: 'npm: webclaw-dashboard-server',
  },
  'claude-code': {
    name: 'Claude Code CLI',
    type: 'ai-cli',
    risk: 'low',
    desc: 'AI 编程命令行',
    repo: 'npm: @anthropic-ai/claude-code',
  },
  'claude-code-ui': {
    name: 'Claude Code UI',
    type: 'ai-ui',
    risk: 'medium',
    desc: '浏览器 IDE 界面',
    repo: 'siteboon/claudecodeui',
  },
  'opencode-ai': {
    name: 'OpenCode AI',
    type: 'ai-cli',
    risk: 'medium',
    desc: 'AI 编程命令行（备用）',
    repo: 'npm: opencode-ai',
  },
  'code-server': {
    name: 'code-server (VS Code)',
    type: 'ide',
    risk: 'medium',
    desc: 'Web 版 VS Code',
    repo: 'coder/code-server',
  },
  'supervisor': {
    name: 'Supervisor',
    type: 'system',
    risk: 'high',
    desc: '进程守护',
    repo: 'system: supervisord',
  },
  'gh': {
    name: 'GitHub CLI',
    type: 'cli',
    risk: 'low',
    desc: 'gh 命令行',
    repo: 'cli/cli',
  },
  'cloudflared': {
    name: 'Cloudflare Tunnel',
    type: 'network',
    risk: 'medium',
    desc: '反向代理隧道',
    repo: 'cloudflare/cloudflared',
  },
  'docker-ce-cli': {
    name: 'Docker CLI',
    type: 'cli',
    risk: 'low',
    desc: '容器命令行',
    repo: 'system: docker',
  },
};

const LOCKED_ITEMS = [
  {
    id: 'nodejs',
    name: 'Node.js',
    type: 'runtime',
    pinned: '22.22.1',
    file: 'Dockerfile.base',
    note: 'ARG NODE_VERSION 锁定，请修改 Dockerfile.base 后重建镜像',
    snippet: 'ARG NODE_VERSION=22.22.1',
  },
  {
    id: 'vibe-kanban',
    name: 'Vibe Kanban',
    type: 'tool',
    pinned: '0.1.8',
    file: 'Dockerfile.full',
    note: '锁定版本号 0.1.8，请修改后重建',
    snippet: 'RUN npm install -g vibe-kanban@0.1.8',
  },
];

const INITIAL_LOG = [
  { ts: new Date().toLocaleTimeString('en-GB', { hour12: false }), msg: 'webclaw-upgrader v0.2.0 启动', tone: 'dim' },
];

Object.assign(window, { ITEM_META, LOCKED_ITEMS, INITIAL_LOG });
