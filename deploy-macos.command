#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
LOG="$PWD/netlify-v0531-deploy.log"
exec > >(tee "$LOG") 2>&1

SITE_ID="89dfa228-952e-4712-8a99-9344cb0ea5fd"
BACKUP_DIR="$PWD/.migration-backup-$(date +%Y%m%d-%H%M%S)"

echo "=== 黄林坑村治理智能助手 V0.5.3.1 回归修复部署 ==="
echo "V0.5.3.1：基础聊天/头像回归修复 + Agent Planner + 全局知识检索 + Hybrid Search + V0.5.2 QuerySpec"
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

echo "\n[6/8] 对齐 production migration 历史，并保留本版本新增 migration"
echo "说明：已执行过的 migration 以 production 为准；本地仅追加 production 尚不存在的新 migration，不会改写历史。"
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

LOCAL_BACKUP="$BACKUP_DIR/migrations-before-sync"
if [ -d "$LOCAL_BACKUP" ]; then
  for migration_dir in "$LOCAL_BACKUP"/*; do
    [ -d "$migration_dir" ] || continue
    name="$(basename "$migration_dir")"
    if [ ! -e "netlify/database/migrations/$name" ]; then
      echo "追加本版本新 migration: $name"
      cp -R "$migration_dir" "netlify/database/migrations/$name"
    else
      echo "保留 production 历史 migration: $name"
    fi
  done
fi

echo "migration 已对齐；旧历史来自 production，新 migration 保留在本地等待部署。"
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
  echo "本次版本：V0.5.3.1（AI村长头像兜底 + 基础聊天稳定性 + Agent错误边界 + V0.5.3知识检索）。"
  echo "请重点回归：来聊天、你的头像呢、蜂蜜生产情况、70岁以上人数、跨域人员筛选。"
  echo "production migration 历史已对齐；006_knowledge-retrieval 会作为新增 migration 应用。"
  command -v open >/dev/null 2>&1 && open "https://rural-governance-agent-demo.netlify.app" || true
else
  echo "\n部署没有完成。完整日志：$LOG"
  echo "请把日志最后 120 行发给我。"
fi
exit "$STATUS"
