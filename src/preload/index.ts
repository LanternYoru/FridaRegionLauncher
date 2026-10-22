import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Bridge, Message } from '../shared/types';
const bridge: Bridge = {
  load: () => ipcRenderer.invoke('settings:load'), save: value => ipcRenderer.invoke('settings:save', value),
  selectExe: () => ipcRenderer.invoke('file:exe'), selectDirectory: () => ipcRenderer.invoke('file:directory'),
  filePath: file => webUtils.getPathForFile(file), icon: path => ipcRenderer.invoke('file:icon', path),
  command: (command, payload) => ipcRenderer.invoke('backend:command', command, payload),
  onMessage: callback => { const listener = (_event: Electron.IpcRendererEvent, message: Message) => callback(message); ipcRenderer.on('backend:message', listener); return () => ipcRenderer.removeListener('backend:message', listener); },
  exportLogs: text => ipcRenderer.invoke('logs:export', text)
};
contextBridge.exposeInMainWorld('launcher', bridge);
