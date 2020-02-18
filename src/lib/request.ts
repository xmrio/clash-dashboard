import axios from 'axios'
import { Partial, getLocalStorageItem, to } from '@lib/helper'
import { isClashX, jsBridge } from '@lib/jsBridge'
import { createAsyncSingleton } from '@lib/asyncSingleton'
import { Log } from '@models/Log'
import { StreamReader } from './streamer'

export interface Config {
    port: number
    'socks-port': number
    'redir-port': number
    'allow-lan': boolean
    mode: string
    'log-level': string
}

export interface Rules {
    rules: Rule[]
}

export interface Rule {
    type: string
    payload: string
    proxy: string
}

export interface Proxies {
    proxies: {
        [key: string]: Proxy | Group
    }
}

export interface Provider {
    name: string
    proxies: Array<Group | Proxy>
    type: 'Proxy' | 'Rule'
    vehicleType: 'HTTP' | 'File' | 'Compatible'
    updatedAt?: string
}

export interface ProxyProviders {
    providers: {
        [key: string]: Provider
    }
}

interface History {
    time: string
    delay: number
}

export interface Proxy {
    name: string
    type: 'Direct' | 'Reject' | 'Shadowsocks' | 'Vmess' | 'Socks' | 'Http'
    history: History[]
}

export interface Group {
    name: string
    type: 'Selector' | 'URLTest' | 'Fallback'
    now: string
    all: string[]
    history: History[]
}

export interface Snapshot {
    uploadTotal: number
    downloadTotal: number
    connections: Connections[]
}

export interface Connections {
    id: string
    metadata: {
        network: string
        type: string
        host: string
        sourceIP: string
        sourcePort: string
        destinationPort: string
        destinationIP?: string
    }
    upload: number
    download: number
    start: string
    chains: string[]
    rule: string
}

export async function getExternalControllerConfig () {
    if (isClashX()) {
        const info = await jsBridge.getAPIInfo()

        return {
            hostname: info.host,
            port: info.port,
            secret: info.secret
        }
    }

    const hostname = getLocalStorageItem('externalControllerAddr', '127.0.0.1')
    const port = getLocalStorageItem('externalControllerPort', '9090')
    const secret = getLocalStorageItem('secret', '')

    if (!hostname || !port) {
        throw new Error('can\'t get hostname or port')
    }

    return { hostname, port, secret }
}

export const getInstance = createAsyncSingleton(async () => {
    const {
        hostname,
        port,
        secret
    } = await getExternalControllerConfig()

    return axios.create({
        baseURL: `//${hostname}:${port}`,
        headers: secret ? { Authorization: `Bearer ${secret}` } : {}
    })
})

export async function getConfig () {
    const req = await getInstance()
    return req.get<Config>('configs')
}

export async function updateConfig (config: Partial<Config>) {
    const req = await getInstance()
    return req.patch<void>('configs', config)
}

export async function getRules () {
    const req = await getInstance()
    return req.get<Rules>('rules')
}

export async function updateRules () {
    const req = await getInstance()
    return req.put<void>('rules')
}

export async function getProxyProviders () {
    const req = await getInstance()
    return req.get<ProxyProviders>('providers/proxies', {
        validateStatus (status) {
            // compatible old version
            return (status >= 200 && status < 300) || status === 404
        }
    })
    // compatible old version
        .then(resp => {
            if (resp.status === 404) {
                resp.data = { providers: {} }
            }
            return resp
        })
}

export async function updateProvider (name: string) {
    const req = await getInstance()
    return req.put<void>(`providers/proxies/${name}`)
}

export async function healthCheckProvider (name: string) {
    const req = await getInstance()
    return req.get<void>(`providers/proxies/${name}/healthcheck`)
}

export async function getProxies () {
    const req = await getInstance()
    return req.get<Proxies>('proxies')
}

export async function getProxy (name: string) {
    const req = await getInstance()
    return req.get<Proxy>(`proxies/${name}`)
}

export async function getVersion () {
    const req = await getInstance()
    return req.get<{ version: string }>('version')
}

export async function getProxyDelay (name: string) {
    const req = await getInstance()
    return req.get<{ delay: number }>(`proxies/${name}/delay`, {
        params: {
            timeout: 5000,
            url: 'http://www.gstatic.com/generate_204'
        }
    })
}

export async function closeAllConnections () {
    const req = await getInstance()
    return req.delete('connections')
}

export async function changeProxySelected (name: string, select: string) {
    const req = await getInstance()
    return req.put<void>(`proxies/${name}`, { name: select })
}

export const getLogsStreamReader = createAsyncSingleton(async function () {
    const externalController = await getExternalControllerConfig()
    const { data: config } = await getConfig()
    const [data, err] = await to(getVersion())
    const version = err ? 'unkonwn version' : data.data.version
    const useWebsocket = !!version || true

    const logUrl = `${location.protocol}//${externalController.hostname}:${externalController.port}/logs?level=${config['log-level']}`
    return new StreamReader<Log>({ url: logUrl, bufferLength: 200, token: externalController.secret, useWebsocket })
})

export const getConnectionStreamReader = createAsyncSingleton(async function () {
    const externalController = await getExternalControllerConfig()
    const [data, err] = await to(getVersion())
    const version = err ? 'unkonwn version' : data.data.version

    const useWebsocket = !!version || true
    const logUrl = `${location.protocol}//${externalController.hostname}:${externalController.port}/connections`
    return new StreamReader<Snapshot>({ url: logUrl, bufferLength: 200, token: externalController.secret, useWebsocket })
})
