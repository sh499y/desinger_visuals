import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AudioLevels, AudioStatus, FrontApi, FrontInit, ServerMessage } from '@shared/types'

const api: FrontApi = {
  init: () => ipcRenderer.invoke('front:init') as Promise<FrontInit>,
  onMessage: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: ServerMessage): void => cb(msg)
    ipcRenderer.on('front:message', listener)
    return () => ipcRenderer.removeListener('front:message', listener)
  },
  sendAudio: (levels: AudioLevels) => ipcRenderer.send('front:audio', levels),
  sendAudioStatus: (status: AudioStatus) => ipcRenderer.send('front:audio-status', status),
  openPanel: () => ipcRenderer.send('front:open-panel')
}

contextBridge.exposeInMainWorld('api', api)
