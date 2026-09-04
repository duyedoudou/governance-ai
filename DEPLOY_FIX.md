# V0.4.2 部署修正

上一版 `deploy-macos.command` 少了 `npm install`，而 V0.4 的 Netlify Function 需要 `@netlify/database` 和 `@netlify/functions`。V0.4.2 已修正。

新的部署脚本会：
1. 安装依赖；
2. 检查 Netlify 登录和站点绑定；
3. 检查 production Database，未就绪时尝试初始化；
4. 用 `netlify build --debug` 先做本地打包检查；
5. 正式 production deploy；
6. 把完整日志保存为 `netlify-v042-deploy.log`。

如果失败，不需要截图整屏，只把日志最后 80 行发给我。
