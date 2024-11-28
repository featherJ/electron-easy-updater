export interface UpdateInfo {
    readonly version: string;
    readonly url: string;
    readonly releaseNotes?: string[];
    readonly releaseDate: string;
    readonly fullUpdate: boolean;
    // todo 加入最低系统需求 minimumSystemVersion 的支持
}

export class AppUpdater {
    private configUrl: string;
    /**
     * @param url 更新配置文件的url
     */
    public constructor(configUrl: string) {
        this.configUrl = configUrl
    }

    /**
     * 检查指定的配置url是否存在可用更新
     * 
     * Check if there is an available update at the specified configuration URL
     */
    public checkForUpdates(): Promise<UpdateInfo | null> {
        return Promise.resolve(null);
    }

    /**
     * 下载更新包
     * 
     * Download the update package.
     * 
     * @param onProgress 
     * @returns 
     */
    public downloadUpdate(onProgress: (loaded: number, total: number) => void): Promise<string> {
        return Promise.resolve("");
    }

    /**
     * 退出并安装更新，安装完成后会自动重启app。
     * 
     * Exit and install the update. The app will automatically restart after installation.
     */
    public quitAndInstall():void{
        return;
    }

}