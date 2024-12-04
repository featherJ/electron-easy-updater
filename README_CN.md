# Electron Easy Updater

中文文档 | [English](README.md)

这是一个用于 Electron 程序自动更新的 NodeJs 模块。配合 [electron-easy-builder](https://github.com/featherJ/electron-easy-builder) 可以更简单的实现 Electron 程序在 **Windows** 和 **macOS** 上的的**全量更新**与**最小更新**。

## 功能简介
* 支持 Windows 和 macOS 系统。
* macOS 上不强制要求更新包必须为已签名。
* 自动判断本次更新是全量更新，还是最小更新。
    * 全量更新是更新应用的全部内容。
    * 最小更新是只更新 asar 包，以及资源文件。而不会下载 Electron 和 Node 等运行环境。


## Electron 程序的打包
这个更新模块，只支持通过 electron-easy-builder 打包的应用程序。 关于如何使用 electron-easy-builder 进行打包，可以参考： https://github.com/featherJ/electron-easy-builder


## 工作原理
使用 electron-easy-builder 打包的过程中，会根据当前项目的 electron 版本，以及会作用到最终应用程序上的编译和打包参数等信息，生成一个 `build` 字段到打包结果以及更新配置文件中。

更新模块会对比远程更新配置文件与当前应用程序中的 `build` 参数，来判断本地更新是否需要下载全部依赖环境，亦或是只更新资源部分。

在 macOS 系统中，更新模块会将更新包内容直接覆盖到当前 app 中，并重启当前应用以完成更新。

在 Windows 系统中，更新模块会打开更新包的安装器程序，并退出当前应用。接下来会由安装器来安装更新，并在安装完成后重新打开当前程序。 

## 如何使用
当前更新模块的 API 极其简洁。使用示例可参考： https://github.com/featherJ/editor-electron-template/blob/master/src/code/electron-main/main.ts

在 `main.ts` 中：
```typescript
// TODO 将如下 configUrl 替换为您已配置好的地址

/* 在开发过程中，支持本地路径的测试如：/Users/xxx/app-update.json 或 D:\xxx\app-update.json 
（无论是开发环境还是发型环境请确保更新包文件与app-update.json处于同一目录下） */
const updater = new AppUpdater("https://xxx.xxx/xxx/app-update.json");

const checkUpdate = async () => {
  // 打印日志到本地
  console.log("userData: ", app.getPath('userData'));

  logger.transports.file.maxSize = 1002430 // 10M
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
  logger.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log')

  updater.logger = logger;
  // 添加更新监听
  updater.on("checking-for-update", () => {
    console.log("checking-for-update");
  });
  updater.on("update-available", info => {
    console.log("update-available", info);
  });
  updater.on("update-not-available", info => {
    console.log("update-not-available", info);
  });
  updater.on("download-progress", (loaded, total) => {
    console.log(`download-progress loaded:${loaded} total:${total}`);
  });
  updater.on("update-downloaded", file => {
    console.log("update-downloaded", file);
  });
  updater.on("error", (error, message) => {
    console.log(`error:${error} message:${message}`);
  });

  // 检查更新
  const updateInfo = await updater.checkForUpdates();

  if (updateInfo) {
    let downloaded: string = null;
    try {
      downloaded = await updater.downloadUpdate((loaded, total) => {
        // 可以更新界面显示下载进度
      });
    } catch (error) {
      // 下载失败
    }
    if (downloaded) {
      dialog.showMessageBox({
        title: `New Version Available`,
        message: `The latest version v${updateInfo.remoteVersion} has been downloaded for you.`,
        buttons: ['Install Now', 'Cancel'],
        defaultId: 0,
      }).then(async result => {
        if (result.response === 0) {
          try {
            await updater.quitAndInstall();
          } catch (error) {
            // 安装失败
          }
        }
      });
    }
  }
}
```

## TODO
* 最低需要的操作系统的支持