import { Notification } from '@arco-design/web-react';
import { Ps4PkgCategory } from '@njzy/ps4-pkg-info';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient, WebDAVClient } from 'webdav/web';

import { FileServerHost, FileServerType, FileStat } from '@/types';
import { getInitConfigFromStore, sortServerFiles, updateConfigStore } from '@/utils';

import { useWebDavPkgInfo } from './useWebDavPkgInfo';

export const useFileServer = ({
  forceWebDavDownloadLinkToHttp,
  aggregationMode
}: {
  forceWebDavDownloadLinkToHttp?: boolean;
  aggregationMode?: boolean;
}) => {
  const webDavClient = useRef<WebDAVClient>();

  const [isFileServerReady, setIsFileServerReady] = useState(true);
  const [fileServerHosts, setFileServerHosts] = useState<FileServerHost[]>(() =>
    getInitConfigFromStore('fileServerHosts', [])
  );
  const [curFileServerHostId, setCurFileServerHostId] = useState<string | undefined>(() =>
    getInitConfigFromStore('curFileServerHostId', undefined)
  );

  const curHost = useMemo(() => {
    const curHost = fileServerHosts.find(host => host.id === curFileServerHostId);
    if (curHost?.type === FileServerType.WebDAV) {
      webDavClient.current = createClient(curHost.url, curHost.options);
    }
    return curHost;
  }, [fileServerHosts, curFileServerHostId]);

  useEffect(() => {
    updateConfigStore('fileServerHosts', fileServerHosts);
    updateConfigStore('curFileServerHostId', curFileServerHostId);
  }, [curFileServerHostId, fileServerHosts]);

  const [fileServerFiles, setFileServerFiles] = useState<FileStat[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchKeyWord, setSearchKeyWord] = useState('');
  const [paths, setPaths] = useState<string[]>([]);

  const { pkgInfoData, pkgInfoDataLoading, getWebDavPkgFileInfo } = useWebDavPkgInfo({ setFileServerFiles });

  const getFilesApi = async (curHost: FileServerHost, webDavClient?: WebDAVClient, path = '/') => {
    let res: FileStat[] = [];
    if (curHost.type === FileServerType.WebDAV && webDavClient) {
      res = (await webDavClient.getDirectoryContents(
        path,
        curHost.recursiveQuery ? { deep: true, glob: '**/*.pkg' } : undefined
      )) as FileStat[];
      if (res.length) {
        res.map(item => {
          const curPkgData = pkgInfoData.find(cache => cache.name === item.basename);
          if (curPkgData) {
            item.icon0 = curPkgData.icon0;
            item.paramSfo = curPkgData.paramSfo;
          }
          item.downloadUrl = item.type === 'file' ? webDavClient.getFileDownloadLink(item.filename) : '';
          if (curHost.options?.username && curHost.options?.password) {
            item.downloadUrl = item.downloadUrl.replace(
              /\/\/(.*)@/,
              `//${encodeURIComponent(curHost.options.username)}:${encodeURIComponent(curHost.options.password)}@`
            );
          }
          if (forceWebDavDownloadLinkToHttp && item.downloadUrl.startsWith('https://')) {
            item.downloadUrl = item.downloadUrl.replace('https://', 'http://');
          }
        });
      }
    } else {
      const { data } = await axios.get(
        `${curHost?.url}/api/files?path=${encodeURI(path)}&recursiveQuery=${curHost.recursiveQuery}`
      );
      res = data || [];
    }
    return sortServerFiles(res);
  };

  let didCancel = false;

  const getServerFileListData = async (newPath = paths.join('/')) => {
    if (!curHost) {
      return;
    }
    try {
      setLoading(true);
      const res = await getFilesApi(curHost, webDavClient?.current, newPath);
      if (!didCancel) {
        if (curHost.type === FileServerType.WebDAV) {
          getWebDavPkgFileInfo(res.filter(item => !item.icon0 && item.downloadUrl));
        }
        setFileServerFiles(res || []);
      }
    } catch (err) {
      if (!didCancel) {
        if (err instanceof Error) {
          Notification.error({
            title: 'Get file server files error',
            content: err.message
          });
        }
      }
    } finally {
      if (!didCancel) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!curHost) {
      setLoading(false);
      if (paths.length) {
        setPaths([]);
      }
      setFileServerFiles([]);
      return;
    }

    if (!isFileServerReady || !curHost.url) {
      return;
    }

    getServerFileListData();

    return () => {
      didCancel = true;
    };
  }, [paths, curHost, isFileServerReady]);

  const finalFileServerFiles = useMemo(() => {
    if (!aggregationMode) {
      return fileServerFiles;
    }

    const { titleIds, data, addon, patch } = fileServerFiles.reduce<{
      titleIds: string[];
      data: FileStat[];
      patch: { [titleId: string]: FileStat[] };
      addon: { [titleId: string]: FileStat[] };
    }>(
      (acc, cur) => {
        if (cur.paramSfo?.CATEGORY === Ps4PkgCategory.AdditionalContent) {
          acc.addon[cur.paramSfo.TITLE_ID] = [...(acc.addon[cur.paramSfo.TITLE_ID] || []), cur];
        } else if (cur.paramSfo?.CATEGORY === Ps4PkgCategory.GameApplicationPatch) {
          acc.patch[cur.paramSfo.TITLE_ID] = [...(acc.patch[cur.paramSfo.TITLE_ID] || []), cur];
        } else {
          const isExist = acc.titleIds.includes(cur.paramSfo?.TITLE_ID || '');
          if (!isExist && cur.paramSfo?.TITLE_ID) {
            acc.titleIds.push(cur.paramSfo?.TITLE_ID);
          }
          acc.data.push(cur);
        }
        return acc;
      },
      {
        titleIds: [],
        data: [],
        patch: {},
        addon: {}
      }
    );
    const newData = data.map(item => {
      if (item.paramSfo?.CATEGORY === Ps4PkgCategory.GameDigital) {
        item.addons = addon[item.paramSfo.TITLE_ID];
        item.patchs = patch[item.paramSfo.TITLE_ID];
      }
      return item;
    });
    Object.keys(patch).forEach(titleId => {
      if (!titleIds.includes(titleId)) {
        newData.push(...patch[titleId]);
      }
    });
    Object.keys(addon).forEach(titleId => {
      if (!titleIds.includes(titleId)) {
        newData.push(...addon[titleId]);
      }
    });
    return sortServerFiles(newData);
  }, [fileServerFiles, aggregationMode]);

  return {
    webDavClient,
    fileServerHosts,
    setFileServerHosts,
    curFileServerHostId,
    setCurFileServerHostId,
    curHost,
    searchKeyWord,
    setSearchKeyWord,
    isFileServerReady,
    setIsFileServerReady,
    fileServerFiles: finalFileServerFiles,
    setFileServerFiles,
    loading,
    setLoading,
    pkgInfoDataLoading,
    paths,
    setPaths,
    getServerFileListData
  };
};
