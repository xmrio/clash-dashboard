import React, { useMemo } from 'react'
import { Card, Tag, Icon, Loading } from '@components'
import { useI18n, useProxyProviders } from '@stores'
import { fromNow } from '@lib/date'
import { Provider as IProvider, Proxy as IProxy, updateProvider, healthCheckProvider } from '@lib/request'
import { useVisible } from '@lib/hook'
import { compareDesc } from '@containers/Proxies'
import { Proxy } from '@containers/Proxies/components/Proxy'
import './style.scss'

interface ProvidersProps {
    provider: IProvider
}

export function Provider (props: ProvidersProps) {
    const { update } = useProxyProviders()
    const { translation, lang } = useI18n()

    const { provider } = props
    const { t } = translation('Proxies')

    const { visible, hide, show } = useVisible()

    function handleHealthChech () {
        show()
        healthCheckProvider(provider.name).then(() => update()).finally(() => hide())
    }

    function handleUpdate () {
        show()
        updateProvider(provider.name).then(() => update()).finally(() => hide())
    }

    const proxies = useMemo(() => {
        return (provider.proxies as IProxy[]).slice().sort((a, b) => -1 * compareDesc(a, b))
    }, [provider.proxies])

    return (
        <Card className="proxy-provider">
            <Loading visible={visible} />
            <div className="flex justify-between flex-col md:flex-row md:items-center">
                <div className="flex items-center">
                    <span className="mr-6">{ provider.name }</span>
                    <Tag>{ provider.vehicleType }</Tag>
                </div>
                <div className="flex items-center pt-3 md:pt-0">
                    {
                        provider.updatedAt &&
                        <span className="text-sm">{ `${t('providerUpdateTime')}: ${fromNow(new Date(provider.updatedAt), lang)}`}</span>
                    }
                    <Icon className="pl-5 cursor-pointer text-red" type="healthcheck" size={18} onClick={handleHealthChech} />
                    <Icon className="pl-5 cursor-pointer" type="update" size={18} onClick={handleUpdate} />
                </div>
            </div>
            <ul className="proxies-list">
                {
                    proxies.map((p: IProxy) => (
                        <li key={p.name}>
                            <Proxy className="proxy-provider-item" config={p} />
                        </li>
                    ))
                }
            </ul>
        </Card>
    )
}
