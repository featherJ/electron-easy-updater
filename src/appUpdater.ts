import { exec } from 'child_process';
import { app } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TypedEmitter } from 'tiny-typed-emitter';

interface AppBuildConfig {
    electron: string;
    build: string;
    arch: 'x64' | 'arm64' | 'x86';
}

interface BaseBuildConfig {
    electron: string;
    build: string;
}

interface ArchUpdate {
    download: {
        filename: string;
        size: number;
    };
    minimal: {
        filename: string;
        size: number;
    };
    full: {
        filename: string;
        size: number;
    };
}

/**
 * 更新配置文件
 */
interface UpdateConfig extends BaseBuildConfig {
    date: string;
    version: string;
    x64: ArchUpdate;
    arm64: ArchUpdate;
    x86: ArchUpdate;
    releaseNotes: string[];
}
/**
 * 远程打包配置文件格式
 */
interface RemoteConfig {
    mac?: UpdateConfig;
    win?: UpdateConfig;
}

export interface Logger {
    info(message?: any): void;
    warn(message?: any): void;
    error(message?: any): void;
    debug?(message: string): void;
}

export interface UpdateInfoBase {
    readonly currentVersion: string;
    readonly remoteVersion: string;
    readonly system: 'mac' | 'win';
    // todo 加入最低系统需求 minimumSystemVersion 的支持
}

export interface UpdateInfo extends UpdateInfoBase {
    readonly filename: string;
    readonly url: string;
    readonly size: number;
    readonly fullUpdate: boolean;
    readonly releaseNotes?: string[];
    readonly releaseDate: Date;
}

const compareVersion = (version1: string, version2: string) => {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    const length = Math.max(v1Parts.length, v2Parts.length);
    for (let i = 0; i < length; i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        if (v1Part < v2Part) {
            return -1; // version1 < version2
        }
        if (v1Part > v2Part) {
            return 1; // version1 > version2
        }
    }
    return 0; // version1 == version2
};

export interface AppUpdaterEvents {
    error: (error: Error, message?: string) => void;
    'checking-for-update': () => void;
    'update-not-available': (info: UpdateInfoBase) => void;
    'update-available': (info: UpdateInfo) => void;
    'update-downloaded': (downloadedFile: string) => void;
    'download-progress': (loaded: number, total: number) => void;
}

export class AppUpdater extends TypedEmitter<AppUpdaterEvents> {
    public logger: Logger = console;

    private configUrl: string;
    private currentUpdateConfig: UpdateInfo | null = null;
    private development = false;

    /**
     * @param url 更新配置文件的url
     */
    public constructor(configUrl: string) {
        super();
        this.configUrl = configUrl;
    }

    /**
     * 检查指定的配置url是否存在可用更新
     *
     * Check if there is an available update at the specified configuration URL
     */
    public async checkForUpdates(): Promise<UpdateInfo | null> {
        this.emit('checking-for-update');
        this.logger.info('Checking for update');
        const currentAppVersion = app.getVersion();
        const currentAppConfig = this.getAppBuildConfig();
        if (!currentAppConfig) {
            return null;
        }
        const remoteAppConfig = await this.getRemoteConfig();
        if (!remoteAppConfig) {
            this.logger.warn(`Failed to read remote configuration from '${this.configUrl}'.`);
            return null;
        }
        let system: 'mac' | 'win';
        if (os.platform() === 'darwin') {
            system = 'mac';
        } else if (os.platform() === 'win32') {
            system = 'win';
        }
        const updateConfig = remoteAppConfig[system!];
        if (!updateConfig) {
            this.logger.info(`'${system!}' does not exist in the remote configuration.`);
            return null;
        }
        const remoteAppVersion = updateConfig.version;
        if (compareVersion(currentAppVersion, remoteAppVersion) !== -1) {
            this.logger.info(`The current version is the latest.`);
            this.emit('update-not-available', {
                currentVersion: currentAppVersion,
                remoteVersion: remoteAppVersion,
                system: system!,
            });
            // 当前版本很新，不需要更新
            return null;
        }
        const arch = currentAppConfig.arch;
        const archUpdate = updateConfig[arch];
        let shouldFullUpdate = false;
        if (currentAppConfig.build !== updateConfig.build || currentAppConfig.electron !== updateConfig.electron) {
            shouldFullUpdate = true;
        }
        let filename: string;
        let size: number;
        if (shouldFullUpdate) {
            this.logger.info(`A full update will be performed this time.`);
            filename = archUpdate.full.filename;
            size = archUpdate.full.size;
        } else {
            this.logger.info(`A minimal update will be performed this time.`);
            filename = archUpdate.minimal.filename;
            size = archUpdate.minimal.size;
        }
        let lastIndex = this.configUrl.lastIndexOf('/');
        if (lastIndex === -1) {
            lastIndex = this.configUrl.lastIndexOf('\\');
        }
        const directory = this.configUrl.substring(0, lastIndex + 1);
        const url = directory + filename;
        this.currentUpdateConfig = {
            currentVersion: currentAppVersion,
            remoteVersion: remoteAppVersion,
            filename,
            url,
            size,
            fullUpdate: shouldFullUpdate,
            releaseNotes: updateConfig.releaseNotes,
            releaseDate: new Date(updateConfig.date),
            system: system!,
        };
        this.emit('update-available', this.currentUpdateConfig);
        this.logger.info(`Found version ${this.currentUpdateConfig.remoteVersion} (url: ${url}).`);
        return Promise.resolve(this.currentUpdateConfig);
    }

    private async getRemoteConfig(): Promise<RemoteConfig | null> {
        // 检查本地
        try {
            if (fs.existsSync(this.configUrl)) {
                const configContent = fs.readFileSync(this.configUrl, { encoding: 'utf-8' });
                return JSON.parse(configContent);
            }
        } catch (error) {
            // do nothing
        }
        // 检查远程
        try {
            const response = await fetch(this.configUrl);
            const remoteConfig = (await response.json()) as RemoteConfig;
            return remoteConfig;
        } catch (error) {
            // do nothing
        }
        return null;
    }

    private getAppBuildConfig(): AppBuildConfig | null {
        const configPath = this.getAppBuildPath();
        if (configPath) {
            try {
                const configContent = fs.readFileSync(configPath, { encoding: 'utf8' });
                return JSON.parse(configContent) as AppBuildConfig;
            } catch (error) {
                this.logger.warn(`Build configuration file is broken`);
            }
        }
        return null;
    }

    private getAppBuildPath(): string | null {
        let appPath = app.getAppPath();
        const appPathStat = fs.statSync(appPath);
        const configFilename = 'app-build.json';
        let configPath = '';
        if (appPathStat.isDirectory()) {
            configPath = path.join(appPath, configFilename);
            if (fs.existsSync(configPath)) {
                // 开发环境下的配置路径
                this.development = true;
                this.logger.info(`Development environment, build config path is '${configPath}'.`);
                return configPath;
            } else {
                // 打包后，没有将代码都打包成 asar 情况下的配置路径
                configPath = path.join(appPath, '../', configFilename);
                if (fs.existsSync(configPath)) {
                    this.logger.info(`Production environment, build config path is '${configPath}'.`);
                    return configPath;
                }
            }
        } else {
            appPath = path.dirname(appPath);
            configPath = path.join(appPath, configFilename);
            if (fs.existsSync(configPath)) {
                // 打包后，将代码都打包成了 asar 情况下的配置路径
                this.logger.info(`Production environment, build config path is '${configPath}'.`);
                return configPath;
            }
        }
        this.logger.warn(`Build configuration file not found.`);
        return null;
    }

    private getAppMacContentPath(): string {
        const appPath = app.getAppPath();
        const contentsPath = path.join(appPath, '../../');
        return contentsPath;
    }

    private checkAccess(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.W_OK);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 下载更新包
     *
     * Download the update package.
     *
     * @param onProgress
     * @returns
     */
    public async downloadUpdate(onProgress?: (loaded: number, total: number) => void): Promise<string | null> {
        this.logger.info(`Downloading update files`);
        if (!this.currentUpdateConfig) {
            this.logger.warn(`No updates found. Please ensure that 'checkForUpdates' has been executed.`);
            return null;
        }
        if (onProgress) {
            onProgress(0, this.currentUpdateConfig.size);
        }
        this.emit('download-progress', 0, this.currentUpdateConfig.size);
        // 本地测试
        if (fs.existsSync(this.currentUpdateConfig.url)) {
            const localPath = path.join(os.tmpdir(), this.currentUpdateConfig.filename);
            fs.copyFileSync(this.currentUpdateConfig.url, localPath);
            if (onProgress) {
                onProgress(this.currentUpdateConfig.size, this.currentUpdateConfig.size);
            }
            this.emit('download-progress', this.currentUpdateConfig.size, this.currentUpdateConfig.size);
            this.localUpdatePath = localPath;
            return localPath;
        }
        let localPath: string | null;
        // 远程下载
        try {
            localPath = await this.download(
                this.currentUpdateConfig.filename,
                this.currentUpdateConfig.url,
                this.currentUpdateConfig.size,
                onProgress,
            );
        } catch (e) {
            const error = e as Error;
            this.emit('error', error, (error.stack || error).toString());
            this.logger.error(` Failed to download update files: ${e}.`);
            // 要抛出错误，更新弹窗可以根据这个显示错误
            throw e;
        }
        this.localUpdatePath = localPath;
        this.emit('update-downloaded', localPath);
        this.logger.info(` Update files downloaded: '${localPath}'.`);
        return localPath;
    }

    private localUpdatePath: string | null = null;
    private async download(
        filename: string,
        url: string,
        total: number,
        onProgress?: (loaded: number, total: number) => void,
    ): Promise<string> {
        const response = await fetch(url);
        if (!response.body) {
            throw new Error(`The remote update file ${filename} does not exist.`);
        }

        const localPath = path.join(os.tmpdir(), filename);
        const fileStream = fs.createWriteStream(localPath);
        const reader = response.body.getReader();

        let loaded = 0;
        // 处理流的内容
        const read = async () => {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            loaded += value.length;
            fileStream.write(value);
            this.emit('download-progress', loaded, total);
            if (onProgress) {
                onProgress(loaded, total);
            }
            await read(); // 递归读取剩余数据
        };
        await read();
        fileStream.end();
        return localPath;
    }

    /**
     * 退出并安装更新，安装完成后会自动重启app。
     *
     * Exit and install the update. The app will automatically restart after installation.
     */
    public async quitAndInstall(): Promise<void> {
        this.logger.info(`Quitting the application and installing update.`);
        if (!this.currentUpdateConfig) {
            this.logger.warn(`No updates found. Please ensure that 'checkForUpdates' has been executed.`);
            return;
        }
        if (!this.localUpdatePath) {
            this.logger.warn(`Update files not found. Please ensure that 'downloadUpdate' has been executed`);
            return;
        }

        if (this.currentUpdateConfig.system === 'mac') {
            this.logger.info(`Starting update on macOS.`);
            return new Promise<void>((resolve, reject) => {
                const targetPath = this.getAppMacContentPath();
                const writeable = this.checkAccess(targetPath);
                let cmd = `unzip -o "${this.localUpdatePath}" -d "${this.getAppMacContentPath()}"`;
                if (!writeable) {
                    cmd = 'sudu ' + cmd;
                }
                exec(cmd, (error, stdout, stderr) => {
                    // 这里需要抛出错误，更新弹窗可以根据这个来显示更新失败
                    if (error) {
                        this.logger.warn(`Update failed: ${error}`);
                        this.emit('error', error, (error.stack || error).toString());
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        this.logger.warn(`Update failed: ${stderr}`);
                        this.emit('error', new Error(stderr), stderr);
                        reject(new Error(stderr));
                        return;
                    }
                    if (this.development) {
                        this.logger.info(
                            `Update complete. In the development environment, the application will not be restarted to avoid a loop.`,
                        );
                    } else {
                        this.logger.info(`Update complete, restarting the application.`);
                        app.relaunch();
                        app.quit();
                    }
                    resolve();
                });
            });
        } else if (this.currentUpdateConfig.system === 'win') {
            this.logger.info(`Starting update on Windows.`);
            return new Promise<void>((resolve) => {
                const installArgs = ['/VERYSILENT', '/update="true"'].join(' ');
                this.logger.info(`Starting the update installer.`);
                exec(`"${this.localUpdatePath}" ${installArgs}`);
                setTimeout(() => {
                    this.logger.info(`The application is quitting.`);
                    app.quit();
                    resolve();
                }, 200);
            });
        }
        return Promise.resolve();
    }
}
