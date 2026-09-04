#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
LOG="$PWD/netlify-v049-deploy.log"
exec > >(tee "$LOG") 2>&1

echo "=== 黄林坑村治理智能助手 V0.4.9 部署 ==="
echo "Civic AI Design System UI + AI村长头像 + 原有治理能力"
echo "目录: $PWD"

echo "\n[1/7] 检查 Node / npm"
command -v node >/dev/null 2>&1 || { echo "未找到 Node.js，请先安装 Node.js 20+。"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "未找到 npm。"; exit 1; }
node -v
npm -v

echo "\n[2/7] 清理 Functions 目录中的非函数文件"
find netlify/functions -maxdepth 1 -type f \( -name '*.d.ts' -o -name '.DS_Store' -o -name '._*' \) -print -delete 2>/dev/null || true

echo "\n[3/7] 校验 Function 名称"
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

echo "\n[4/7] 安装依赖"
npm install

echo "\n[5/7] 绑定现有 Netlify 站点"
npx netlify status || true
mkdir -p .netlify
cat > .netlify/state.json <<'EOF'
{
  "siteId": "89dfa228-952e-4712-8a99-9344cb0ea5fd"
}
EOF

echo "\n[6/7] 本地 Netlify build"
npx netlify build --debug
BUILD_STATUS=$?
if [ "$BUILD_STATUS" -ne 0 ]; then
  echo "\n本地 build 失败。日志：$LOG"
  exit "$BUILD_STATUS"
fi

echo "\n[7/7] 部署到 production"
npx netlify deploy --prod --build --debug
STATUS=$?
if [ "$STATUS" -eq 0 ]; then
  echo "\n部署成功：https://rural-governance-agent-demo.netlify.app"
  echo "沿用现有 production Database / Functions / Blobs，更新 V0.4.9 查询路由修复、前端 UI、AI村长头像与交互代码。"
  command -v open >/dev/null 2>&1 && open "https://rural-governance-agent-demo.netlify.app" || true
else
  echo "\n部署没有完成。完整日志：$LOG"
  echo "请把日志最后 120 行发给我。"
fi
exit "$STATUS"
