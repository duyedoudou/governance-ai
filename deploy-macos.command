#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
LOG="$PWD/netlify-v051-deploy.log"
exec > >(tee "$LOG") 2>&1

SITE_ID="89dfa228-952e-4712-8a99-9344cb0ea5fd"
BACKUP_DIR="$PWD/.migration-backup-$(date +%Y%m%d-%H%M%S)"

echo "=== 黄林坑村治理智能助手 V0.5.1 部署 ==="
echo "对话意图路由 + DOCX结构化回答 + 上传资料删除 + AI村长头像"
echo "目录: $PWD"

echo "\n[1/8] 检查 Node / npm"
command -v node >/dev/null 2>&1 || { echo "未找到 Node.js，请先安装 Node.js 20+。"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "未找到 npm。"; exit 1; }
node -v
npm -v

echo "\n[2/8] 清理 Functions 目录中的非函数文件"
find netlify/functions -maxdepth 1 -type f \( -name '*.d.ts' -o -name '.DS_Store' -o -name '._*' \) -print -delete 2>/dev/null || true

echo "\n[3/8] 校验 Function 名称"
BAD=0
while IFS= read -r f; do
  base="$(basename "$f")"
  stem="${base%.*}"
  if ! [[ "$stem" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "非法 Function 入口: $base -> 名称 $stem"
    BAD=1
  else
    echo "OK: $base -> $stem"
  fi
done < <(find netlify/functions -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' -o -name '*.mts' -o -name '*.cts' \) | sort)
[ "$BAD" -eq 0 ] || exit 1

echo "\n[4/8] 安装依赖"
npm install || exit $?

echo "\n[5/8] 绑定现有 Netlify 站点"
mkdir -p .netlify
cat > .netlify/state.json <<STATE
{
  "siteId": "$SITE_ID"
}
STATE
npx netlify status || true

echo "\n[6/8] 同步 production migration 历史"
echo "说明：只同步 migration 文件，不会删除或重建生产数据库。"
mkdir -p "$BACKUP_DIR"
if [ -d netlify/database/migrations ]; then
  cp -R netlify/database/migrations "$BACKUP_DIR/migrations-before-sync"
fi
rm -rf netlify/database/migrations
mkdir -p netlify/database/migrations
npx netlify database migrations pull --branch production --force
MIG_STATUS=$?
if [ "$MIG_STATUS" -ne 0 ]; then
  echo "\n同步 production migrations 失败。"
  echo "本地原 migration 已备份到：$BACKUP_DIR"
  echo "请把日志最后 120 行发给我：$LOG"
  exit "$MIG_STATUS"
fi

echo "production migrations 已同步。"
npx netlify database status --branch production || true

echo "\n[7/8] 本地 Netlify build"
npx netlify build --debug
BUILD_STATUS=$?
if [ "$BUILD_STATUS" -ne 0 ]; then
  echo "\n本地 build 失败。日志：$LOG"
  exit "$BUILD_STATUS"
fi

echo "\n[8/8] 部署到 production"
npx netlify deploy --prod --build --debug
STATUS=$?
if [ "$STATUS" -eq 0 ]; then
  echo "\n部署成功：https://rural-governance-agent-demo.netlify.app"
  echo "本次版本：V0.5.1（闲聊/工作意图路由 + DOCX问答 + 资料删除 + AI村长头像）。"
  echo "production migration 历史已与 Netlify Database 对齐。"
  command -v open >/dev/null 2>&1 && open "https://rural-governance-agent-demo.netlify.app" || true
else
  echo "\n部署没有完成。完整日志：$LOG"
  echo "请把日志最后 120 行发给我。"
fi
exit "$STATUS"
