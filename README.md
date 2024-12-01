# Electron Easy Updater

[中文文档](README_CN.md) | English

This is a Node.js module for automatic updates in Electron applications. When used together with [electron-easy-builder](https://github.com/featherJ/electron-easy-builder), it simplifies implementing both full updates and minimal updates for Electron applications on Windows and macOS.

## Features Overview
* Supports Windows and macOS systems.
* Update packages on macOS do not require mandatory signing.
* Automatically determines whether the update is a full update or a minimal update.
  * A full update replaces the entire application.
  * A minimal update only updates the asar package and resource files, without downloading the Electron and Node runtime environments.

## Packaging Electron Applications
This update module only supports applications packaged using electron-easy-builder. For instructions on how to package with electron-easy-builder, refer to: https://github.com/featherJ/electron-easy-builder

## How It Works
During the packaging process with electron-easy-builder, a `build` field is generated in both the packaged application and the update configuration file based on the project's current Electron version and the compilation and packaging parameters applied to the final application.

The update module compares the remote update configuration file with the local application's `build` parameters to determine whether the update needs to download the entire runtime environment or only update the resource files.

On macOS, the update module directly overwrites the contents of the current app with the update package and restarts the application to complete the update.

On Windows, the update module opens the update package installer and exits the current application. The installer then installs the update and restarts the application once the installation is complete.

## How to Use
The API of this update module is very simple. For usage examples, refer to: https://github.com/featherJ/editor-electron-template/blob/master/src/code/electron-main/main.ts

In `main.ts`:
```typescript
// TODO Replace the following configUrl with your configured address.

/* During development, support testing with local paths, e.g., /Users/xxx/app-update.json or D:\xxx\app-update.json.
(Ensure that the update package files are in the same directory as app-update.json in both development and production environments.) */
const updater = new AppUpdater("https://xxx.xxx/xxx/app-update.json");

const checkUpdate = async () => {
  // Print logs locally
  console.log("userData: ", app.getPath('userData'));

  logger.transports.file.maxSize = 1002430 // 10M
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
  logger.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log')

  updater.logger = logger;
  // Add updater listener
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

  // Check for updates
  const updateInfo = await updater.checkForUpdates();

  if (updateInfo) {
    let downloaded: string = null;
    try {
      downloaded = await updater.downloadUpdate((loaded, total) => {
        // Display download progress
      });
    } catch (error) {
      // Download failed
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
            // Installation failed
          }
        }
      });
    }
  }
}
```

## TODO
* Minimum system requirements support