#!/usr/bin/env node
/**
 * 打包 Ubuntu 22 可部署包，可选自动打 tag、推送 Git，并创建 GitHub Release。
 *
 * 用法:
 *   node scripts/pack-release.mjs              # 只打本地包（不升版本）
 *   node scripts/pack-release.mjs --bump       # 升 patch 版本后打包
 *   node scripts/pack-release.mjs --bump minor
 *   node scripts/pack-release.mjs --publish    # 升版本 + 打包 + 推送 + Release
 *
 * 发布需要环境变量 GITHUB_TOKEN（classic PAT 需 repo 权限；fine-grained 需 Contents 读写）
 */
import { spawnSync } from 'child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repo = process.env.GITHUB_REPO || 'pmhw/HalfThereClass';
const args = new Set(process.argv.slice(2));
const publish = args.has('--publish');
const bump = publish || args.has('--bump');
const bumpPart = args.has('major') ? 'major' : args.has('minor') ? 'minor' : 'patch';

function run(cmd, cwd = root, env = process.env) {
  console.log(`> ${cmd}`);
  const result = spawnSync(cmd, {
    cwd,
    env,
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`命令失败: ${cmd}`);
  }
}

function readVersion() {
  return readFileSync(join(root, 'VERSION'), 'utf8').trim();
}

function bumpVersion(version, part) {
  const bits = version.split('.').map((n) => Number(n) || 0);
  while (bits.length < 3) bits.push(0);
  if (part === 'major') {
    bits[0] += 1;
    bits[1] = 0;
    bits[2] = 0;
  } else if (part === 'minor') {
    bits[1] += 1;
    bits[2] = 0;
  } else {
    bits[2] += 1;
  }
  return bits.join('.');
}

function writeJsonVersion(file, version) {
  if (!existsSync(file)) return;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

function ensureNpm(dir) {
  if (!existsSync(join(dir, 'node_modules'))) {
    run('npm install', dir);
  }
}

function writeServerScripts(outDir, version) {
  writeFileSync(join(outDir, 'VERSION'), `${version}\n`);
  writeFileSync(
    join(outDir, 'start.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
export NODE_ENV=production
export PORT="\${PORT:-3000}"
if [[ ! -f .env ]]; then
  echo "缺少 backend/.env，请先复制 .env.example 并填写配置"
  exit 1
fi
if [[ ! -f prisma/dev.db && -f prisma/init.db ]]; then
  cp prisma/init.db prisma/dev.db
  echo "已从 init.db 初始化本地数据库"
fi
npx prisma migrate deploy
npx prisma generate
exec node --enable-source-maps dist/src/main.js
`,
  );
  writeFileSync(
    join(outDir, 'install.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 20+（Ubuntu 22 可用 NodeSource 或 nvm）"
  exit 1
fi
npm ci --omit=dev
npx prisma generate
if [[ ! -f prisma/dev.db ]]; then
  if [[ -f prisma/init.db ]]; then
    cp prisma/init.db prisma/dev.db
    echo "已用初始库 prisma/init.db 生成 prisma/dev.db（之后只在服务器本地增长，不回写 Git）"
  else
    echo "缺少 prisma/init.db，将仅依赖 migrate 创建空库"
  fi
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "已生成 backend/.env，请按服务器环境修改后再启动"
fi
chmod +x "$ROOT/start.sh"
echo "安装完成。启动: $ROOT/start.sh"
echo "或安装 systemd: sudo cp $ROOT/systemd/halfthereclass.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now halfthereclass"
`,
  );
  mkdirSync(join(outDir, 'systemd'), { recursive: true });
  writeFileSync(
    join(outDir, 'systemd/halfthereclass.service'),
    `[Unit]
Description=HalfThereClass API + Admin
Documentation=https://github.com/${repo}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=halfthere
Group=halfthere
WorkingDirectory=/opt/HalfThereClass/backend
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=-/opt/HalfThereClass/backend/.env
ExecStart=/usr/bin/node --enable-source-maps /opt/HalfThereClass/backend/dist/src/main.js
Restart=always
RestartSec=3
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
`,
  );
  writeFileSync(
    join(outDir, 'README-SERVER.md'),
    `# HalfThereClass ${version}（Ubuntu 22）

## 推荐：远程一键安装

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/${repo}/main/scripts/remote-install.sh | sudo bash
\`\`\`

会自动安装依赖、配置 systemd，并开机自启。

## 手动解压安装

\`\`\`bash
tar -xzf HalfThereClass-v${version}-ubuntu22.tar.gz
cd HalfThereClass-v${version}
bash install.sh
# 编辑 backend/.env
bash start.sh
\`\`\`

后台与接口同一端口（默认 3000）：\`http://服务器IP:3000/\`

手机端教师网页：\`http://服务器IP:3000/m/\`

首次安装会用 \`backend/prisma/init.db\` 初始化 \`dev.db\`。之后数据只保存在服务器，不要把 \`dev.db\` 再提交回 Git。请定期备份 \`backend/prisma/dev.db\`。
`,
  );
}

async function createGithubRelease(version, assetPath) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('发布需要 GITHUB_TOKEN 或 GH_TOKEN');
  const tag = `v${version}`;
  const name = `HalfThereClass ${tag}`;
  const body = [
    `## Ubuntu 22 部署包`,
    '',
    `- 版本：\`${tag}\``,
    `- 安装：解压后执行 \`bash install.sh\`，再 \`bash start.sh\``,
    `- 后台与 API 同端口访问`,
  ].join('\n');

  const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      tag_name: tag,
      name,
      body,
      draft: true,
      prerelease: false,
    }),
  });
  const release = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`创建 Release 失败: ${release.message || createRes.status}`);
  }

  const assetName = `HalfThereClass-v${version}-ubuntu22.tar.gz`;
  const bytes = readFileSync(assetPath);
  const uploadUrl = `${release.upload_url.replace(/\{.*\}$/, '')}?name=${encodeURIComponent(assetName)}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: bytes,
  });
  const uploaded = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`上传附件失败: ${uploaded.message || uploadRes.status}`);
  }

  const publishRes = await fetch(`https://api.github.com/repos/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ draft: false }),
  });
  const published = await publishRes.json();
  if (!publishRes.ok) {
    throw new Error(`发布 Release 失败: ${published.message || publishRes.status}`);
  }

  // GitHub 偶发：附件已上传但 releases 列表里 assets 为空，后台会认为“没有部署包”
  let visible = false;
  for (let i = 0; i < 12; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const list = await checkRes.json();
    const item = Array.isArray(list) ? list.find((row) => row.tag_name === tag) : null;
    const names = (item?.assets || []).map((row) => row.name);
    if (names.includes(assetName)) {
      visible = true;
      break;
    }
  }
  if (!visible) {
    throw new Error(`附件已上传，但 GitHub Release 列表尚未显示 ${assetName}，请稍后补传后再更新`);
  }

  return {
    tag,
    htmlUrl: published.html_url || release.html_url,
    downloadUrl: uploaded.browser_download_url,
  };
}

async function main() {
  let version = readVersion();
  if (bump) {
    version = bumpVersion(version, bumpPart);
    writeFileSync(join(root, 'VERSION'), `${version}\n`);
    writeJsonVersion(join(root, 'package.json'), version);
    writeJsonVersion(join(root, 'backend/package.json'), version);
    writeJsonVersion(join(root, 'admin/package.json'), version);
    writeJsonVersion(join(root, 'mobile/package.json'), version);
    writeFileSync(join(root, 'backend/VERSION'), `${version}\n`);
    console.log(`版本 -> ${version}`);
  }

  ensureNpm(join(root, 'admin'));
  ensureNpm(join(root, 'backend'));
  ensureNpm(join(root, 'mobile'));

  run('npm run build', join(root, 'admin'));
  run('npm run build', join(root, 'mobile'));
  run('npx prisma generate', join(root, 'backend'));
  run('npm run build', join(root, 'backend'));

  const releaseName = `HalfThereClass-v${version}`;
  const outRoot = join(root, 'release');
  const outDir = join(outRoot, releaseName);
  const assetName = `HalfThereClass-v${version}-ubuntu22.tar.gz`;
  const assetPath = join(outRoot, assetName);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'backend'), { recursive: true });
  mkdirSync(join(outDir, 'www'), { recursive: true });
  mkdirSync(join(outDir, 'www-mobile'), { recursive: true });

  cpSync(join(root, 'admin/dist'), join(outDir, 'www'), { recursive: true });
  cpSync(join(root, 'mobile/dist'), join(outDir, 'www-mobile'), { recursive: true });
  cpSync(join(root, 'backend/dist'), join(outDir, 'backend/dist'), { recursive: true });
  cpSync(join(root, 'backend/prisma'), join(outDir, 'backend/prisma'), {
    recursive: true,
    filter: (src) => {
      const name = src.replace(/\\/g, '/').split('/').pop();
      return name !== 'dev.db' && name !== 'dev.db-journal' && !String(name).endsWith('.db-journal');
    },
  });
  const initDb = join(root, 'backend/prisma/init.db');
  if (existsSync(initDb)) {
    copyFileSync(initDb, join(outDir, 'backend/prisma/init.db'));
  } else if (existsSync(join(root, 'backend/prisma/dev.db'))) {
    // 没有 init.db 时，用当前本地库做一次初始快照打进发布包（仍不进 Git）
    copyFileSync(join(root, 'backend/prisma/dev.db'), join(outDir, 'backend/prisma/init.db'));
  }
  copyFileSync(join(root, 'backend/package.json'), join(outDir, 'backend/package.json'));
  copyFileSync(join(root, 'backend/package-lock.json'), join(outDir, 'backend/package-lock.json'));
  copyFileSync(join(root, 'backend/.env.example'), join(outDir, 'backend/.env.example'));
  copyFileSync(join(root, 'backend/tsconfig.json'), join(outDir, 'backend/tsconfig.json'));
  copyFileSync(join(root, 'backend/nest-cli.json'), join(outDir, 'backend/nest-cli.json'));
  writeFileSync(join(outDir, 'backend/VERSION'), `${version}\n`);
  writeServerScripts(outDir, version);

  if (existsSync(assetPath)) rmSync(assetPath);
  run(`tar -czf "./${assetName}" "${releaseName}"`, outRoot);

  const meta = {
    name: 'HalfThereClass',
    version,
    builtAt: new Date().toISOString(),
    platform: 'ubuntu22',
    asset: assetName,
    repo: `https://github.com/${repo}`,
  };
  writeFileSync(join(outRoot, 'latest.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(outDir, 'release.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(root, 'backend/VERSION'), `${version}\n`);

  console.log(`打包完成: ${assetPath}`);

  if (!publish) {
    console.log('本地包已生成。发布请执行: npm run pack:publish（需 GITHUB_TOKEN）');
    return;
  }

  run('git add VERSION package.json backend/package.json admin/package.json mobile/package.json backend/VERSION');
  const status = spawnSync('git status --porcelain', { cwd: root, shell: true, encoding: 'utf8' });
  if (String(status.stdout || '').trim()) {
    run(`git commit -m "release: v${version}"`);
  }
  run(`git tag -a v${version} -m "HalfThereClass v${version}"`);
  run('git push origin HEAD');
  run(`git push origin v${version}`);

  const info = await createGithubRelease(version, assetPath);
  console.log(`Release: ${info.htmlUrl}`);
  console.log(`下载: ${info.downloadUrl}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
