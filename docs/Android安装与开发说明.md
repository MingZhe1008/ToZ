# ToZ Android 手机与平板版

基线：Windows 共用业务版本 v1.1.5；Android `1.1.5-android.1`，2026-10-25。开发分支为 `develop`。这是首版安卓移植，采用原生 Android Activity / WebView、应用内打包的界面资源及安卓 SQLite，不需要运行电脑端或访问网页才能离线使用。

## 安装与使用

- 最低 Android 10（API 29），手机和平板通用，不锁定屏幕方向。Android System WebView 需更新到 Chromium 105 或以上；旧 WebView 未验收。
- 本地构建生成 `dist/ToZ-1.1.5-android.1-debug.apk`。此文件为调试签名的测试安装包，不是应用商店发行包。正式发行签名与商店发布尚未配置，不提交私钥。
- 首次启动直接进入空的离线清单；手机底部提供今天、日历、全部和添加待办，左上导航提供分区、即将到来、甘特图、延期和完成记录。平板窄屏为侧栏加内容，宽屏为侧栏、列表及详情三栏。
- 点击任务进入详情；手机返回键先关闭弹层、导航或任务详情，根页面返回后应用进入后台。顶部设置提供外观、阅读、备份、账号及关于。
- 列表更多菜单支持编辑、移动分区、置顶、开始、改期、子任务及删除；列表顶部更多菜单可打开回收站、导出或恢复备份。分区编辑按钮直接可见，长按仍用于排序。
- 日期使用设备当前本地日期；不写入浏览器原型的演示任务。任务 / 子任务、日期与延期足迹、周期与农历、日历、甘特图、分区及回收站复用现有业务实现。

## 本地数据与备份

数据仅保存在本应用私有目录，普通离线副本为 `offline/toz.sqlite`，账号副本为 `profiles/<账号 ID>/toz.sqlite`。这与 Windows 的数据库目录布局不同，**不能直接互换 sqlite 文件**；跨端使用现有 JSON 备份或账号同步。

安卓通过受限桥接实现共享 `desktop/store.cjs` 所需的 SQLite 与文件操作；普通保存仍执行版本检查、首次开始 / 最初计划保护和历史只追加校验，永久删除走原有独立事务。每日最新 JSON 快照保留十四份；恢复与云端替换前生成 `before-restore-*.json` 安全副本。安全副本不自动清理。

导出 / 导入使用 Android 系统文件选择器，不申请所有文件或外部存储权限。导入先校验结构、再显示默认取消的替换确认；应用切换账号或同步进行中不能直接导入。恢复会替换当前副本，已登录账号的恢复结果参与后续同步。卸载 / 清除数据会删除本机所有副本、内部备份与会话；卸载前需导出，或确认已同步。系统整包备份关闭，避免会话密文和密钥在设备间不一致。

## 账号与 Windows 互通

导航底部账号入口 → 账号与同步，使用现有邮箱验证码服务；支持首次登录的保留 / 复制离线数据选择、账号隔离、邮箱绑定、昵称、头像及退出。头像通过系统图片选择器读取，限制 PNG / JPEG / WebP、5 MB，居中裁为 128×128 PNG。选择和读取图片需安卓设备专项验收。

复用 `desktop/cloud.cjs` 与 `desktop/sync-model.cjs` 的完整文档、三方合并和 CAS 版本协议。前台约十五秒重试，恢复前台时尝试同步，可手动同步；后台不承诺持续运行。冲突暂停上传，用户选择保留本机 / 云端；确认时版本变化会拒绝应用。同步不包含设备外观与阅读偏好。服务端不需要新增安卓接口，本轮未部署服务器。

HTTPS 网络请求通过安卓平台证书校验，拒绝 HTTP 与重定向；令牌经 Android Keystore AES-GCM 加密后保存。应用内页面使用 `WebViewAssetLoader` 的本地 HTTPS 来源，桥接只开放给内置页面，阻止外部页面及资源，禁止 file URL 的跨域访问。实现参照 [Android 本地内容说明](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)。

## 开发与构建

需要 Node.js 24、JDK 17 或 21、Android SDK Platform 36 / Build Tools 36.0.0。Gradle Wrapper 固定 8.13，Android Gradle Plugin 固定 8.13.2，WebKit 固定 1.14.0。初次构建需要下载官方依赖。

```powershell
npm ci
$env:ANDROID_HOME = '你的 Android SDK 目录'
npm run build:android
```

`build:android` 先从 `prototype/`、`desktop/`、`mobile/` 打包安卓资源，再执行 `:app:assembleDebug`，最后复制 APK 到 `dist/`。也可先执行 `npm run prepare:android`，再用 Android Studio 打开 `android/`。生成的 assets、SDK、Gradle 缓存及 APK 都不入 Git；不要直接修改生成的 assets。构建脚本也可使用仓库 `.runtime/android-tools/sdk` 的隔离 SDK，未安装时给出配置提示。

主要入口：`android/app/src/main/java/com/toz/app/MainActivity.java` 为原生壳；`mobile/node-adapters.mjs` 为 Store / Cloud 的窄接口适配；`mobile/runtime.mjs` 为账号与存储桥接；`mobile/app.mjs`、`mobile/mobile.css` 为触控和响应式界面。Windows 继续使用 Electron，不加载安卓适配代码。

定向检查：`npm run test:android` 验证安卓适配协议与共享 Store / Cloud；`npm run test:android-ui` 使用隔离 Electron 容器检查打包后的手机 / 平板页面。这两者不等同于安卓设备运行验证，Android SQLite / Keystore / 文件选择器 / 系统返回和软键盘仍需设备检查。完整测试不在默认构建范围内。

## 当前边界

Windows 托盘、启动项、桌面快捷方式、透明浮窗及鼠标穿透不出现在安卓设置中。安卓系统桌面小组件、悬浮窗权限、通知提醒、后台持续同步、商店发行及 iOS 尚未实现。尚未做手机 / 平板真机、旋转 / 分屏、输入法遮挡、Android 系统升级以及两端真实账号联网验收。当前验证结果以 [验证记录](验证记录.md) 为准。
