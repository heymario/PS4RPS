import { ElectronConfigStore } from './configStore';

export interface IElectronIpcMainHandles {
  configStore: {
    get: ElectronConfigStore['get'];
    set: ElectronConfigStore['set'];
    has: ElectronConfigStore['has'];
    delete: ElectronConfigStore['delete'];
    clear: ElectronConfigStore['clear'];
  };
  getPath: (path: Parameters<Electron.App['getPath']>[0]) => Promise<string>;
  chnageWindowStatus: (status: 'minimize' | 'maximize' | 'close') => void;
  getAppInfo: () => Promise<{
    version: string;
    name: string;
    path: string;
  }>;
  openDirectoryDialog: () => Promise<string | undefined>;
  createStaticFileServer: (params: { directoryPath: string; port: number; preferredInterface?: string }) => Promise<
    | {
        url?: string;
        errorMessage?: string;
      }
    | undefined
  >;
  getAvailableInterfaces: () => Promise<{ ipv4: string }[] | { errorMessage?: string } | null>;
  openDevTools: () => void;
  openAppLog: () => void;
  checkUpdate: () => void;
}

export interface IElectronAPI extends IElectronIpcMainHandles {
  platform: NodeJS.Platform;
  openExternal: (url: string) => void;
}
