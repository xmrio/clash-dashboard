import React, { useMemo, useLayoutEffect, useCallback } from 'react'
import { Cell, Column, ColumnInstance, TableOptions, useBlockLayout, useResizeColumns, UseResizeColumnsColumnProps, UseResizeColumnsOptions, useSortBy, UseSortByColumnOptions, UseSortByColumnProps, UseSortByOptions, useTable } from 'react-table'
import classnames from 'classnames'
import { Header, Card, Checkbox, Modal, Icon } from '@components'
import { useI18n } from '@stores'
import * as API from '@lib/request'
import { StreamReader } from '@lib/streamer'
import { useObject, useVisible } from '@lib/hook'
import { fromNow } from '@lib/date'
import { RuleType } from '@models'
import { useConnections } from './store'
import './style.scss'

enum Columns {
    Host = 'host',
    Network = 'network',
    Type = 'type',
    Chains = 'chains',
    Rule = 'rule',
    Speed = 'speed',
    Upload = 'upload',
    Download = 'download',
    Time = 'time'
}

const shouldCenter = new Set<string>([Columns.Network, Columns.Type, Columns.Rule, Columns.Speed, Columns.Upload, Columns.Download, Columns.Time])

interface TableColumn<D extends object = {}> extends
    ColumnInstance<D>,
    UseSortByColumnProps<D>,
    UseResizeColumnsColumnProps<D> {}

type TableColumnOption<D extends object = {}> =
    Column<D> &
    UseResizeColumnsOptions<D> &
    UseSortByColumnOptions<D>

interface ITableOptions<D extends object = {}> extends
    TableOptions<D>,
    UseSortByOptions<D> {}

function formatTraffic(num: number) {
    const s = ['B', 'KB', 'MB', 'GB', 'TB']
    let idx = 0
    while (~~(num / 1024) && idx < s.length) {
        num /= 1024
        idx++
    }

    return `${idx === 0 ? num : num.toFixed(2)} ${s[idx]}`
}

function formatSpeed(upload: number, download: number) {
    switch (true) {
        case upload === 0 && download === 0:
            return '-'
        case upload !== 0 && download !== 0:
            return `↑ ${formatTraffic(upload)}/s ↓ ${formatTraffic(download)}/s`
        case upload !== 0:
            return `↑ ${formatTraffic(upload)}/s`
        default:
            return `↓ ${formatTraffic(download)}/s`
    }
}

interface formatConnection {
    id: string
    host: string
    chains: string
    rule: string
    time: number
    upload: number
    download: number
    type: string
    network: string
    speed: {
        upload: number
        download: number
    }
    completed: boolean
}

export default function Connections() {
    const { translation, lang } = useI18n()
    const t = useMemo(() => translation('Connections').t, [translation])

    // total
    const [traffic, setTraffic] = useObject({
        uploadTotal: 0,
        downloadTotal: 0
    })

    // close all connections
    const { visible, show, hide } = useVisible()
    function handleCloseConnections() {
        API.closeAllConnections().finally(() => hide())
    }

    // connections
    const { connections, feed, save, toggleSave } = useConnections()
    const data: formatConnection[] = useMemo(() => connections.map(
        c => ({
            id: c.id,
            host: `${c.metadata.host || c.metadata.destinationIP}:${c.metadata.destinationPort}`,
            chains: c.chains.slice().reverse().join(' / '),
            rule: c.rule === RuleType.RuleSet ? `${c.rule}(${c.rulePayload})` : c.rule,
            time: new Date(c.start).getTime(),
            upload: c.upload,
            download: c.download,
            type: c.metadata.type,
            network: c.metadata.network.toUpperCase(),
            speed: { upload: c.uploadSpeed, download: c.downloadSpeed },
            completed: !!c.completed
        })
    ), [connections])

    // table
    const columns: TableColumnOption<formatConnection>[] = useMemo(() => [
        { Header: t(`columns.${Columns.Host}`), accessor: 'host', minWidth: 260, width: 260 },
        { Header: t(`columns.${Columns.Network}`), accessor: 'network', minWidth: 80, width: 80 },
        { Header: t(`columns.${Columns.Type}`), accessor: 'type', minWidth: 120, width: 120 },
        { Header: t(`columns.${Columns.Chains}`), accessor: 'chains', minWidth: 200, width: 200 },
        { Header: t(`columns.${Columns.Rule}`), accessor: 'rule', minWidth: 140, width: 140 },
        {
            id: Columns.Speed,
            Header: t(`columns.${Columns.Speed}`),
            accessor(originalRow: formatConnection) {
                return [originalRow.speed.upload, originalRow.speed.download]
            },
            sortType(rowA, rowB) {
                const speedA = rowA.original.speed
                const speedB = rowB.original.speed
                return speedA.download === speedB.download
                    ? speedA.upload - speedB.upload
                    : speedA.download - speedB.download
            },
            minWidth: 200, width: 200,
            sortDescFirst: true
        },
        { Header: t(`columns.${Columns.Upload}`), accessor: 'upload', minWidth: 100, width: 100, sortDescFirst: true },
        { Header: t(`columns.${Columns.Download}`), accessor: 'download', minWidth: 100, width: 100, sortDescFirst: true },
        { Header: t(`columns.${Columns.Time}`), accessor: 'time', minWidth: 120, width: 120, sortType(rowA, rowB) { return rowB.original.time - rowA.original.time } },
    ] as TableColumnOption<formatConnection>[], [t])

    useLayoutEffect(() => {
        let streamReader: StreamReader<API.Snapshot> | null = null

        function handleConnection(snapshots: API.Snapshot[]) {
            for (const snapshot of snapshots) {
                setTraffic({
                    uploadTotal: snapshot.uploadTotal,
                    downloadTotal: snapshot.downloadTotal
                })

                feed(snapshot.connections)
            }
        }

        (async function () {
            streamReader = await API.getConnectionStreamReader()
            streamReader.subscribe('data', handleConnection)
        }())

        return () => {
            if (streamReader) {
                streamReader.unsubscribe('data', handleConnection)
                streamReader.destory()
            }
        }
    }, [feed, setTraffic])

    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        rows,
        prepareRow
    } = useTable(
        {
            columns,
            data,
            autoResetSortBy: false,
            initialState: { sortBy: [{ id: Columns.Time, desc: false }] }
        } as ITableOptions<formatConnection>,
        useResizeColumns,
        useBlockLayout,
        useSortBy
    )
    const headerGroup = useMemo(() => headerGroups[0], [headerGroups])
    const renderCell = useCallback(function (cell: Cell<formatConnection>) {
        switch (cell.column.id) {
            case Columns.Speed:
                return formatSpeed(cell.value[0], cell.value[1])
            case Columns.Upload:
            case Columns.Download:
                return formatTraffic(cell.value)
            case Columns.Time:
                return fromNow(new Date(cell.value), lang)
            default:
                return cell.value
        }
    }, [lang])

    return (
        <div className="page">
            <Header title={t('title')}>
                <span className="connections-filter total">
                    {`(${t('total.text')}: ${t('total.upload')} ${formatTraffic(traffic.uploadTotal)} ${t('total.download')} ${formatTraffic(traffic.downloadTotal)})`}
                </span>
                <Checkbox className="connections-filter" checked={save} onChange={toggleSave}>{t('keepClosed')}</Checkbox>
                <Icon className="connections-filter dangerous" onClick={show} type="close-all" size={20} />
            </Header>
            <Card className="connections-card">
                <div {...getTableProps()} className="connections">
                    <div {...headerGroup.getHeaderGroupProps()} className="connections-header">
                        {
                            headerGroup.headers.map((column, idx) => {
                                const realColumn = column as unknown as TableColumn<formatConnection>
                                const id = realColumn.id
                                return (
                                    <div
                                        {...realColumn.getHeaderProps()}
                                        className={classnames('connections-th', { resizing: realColumn.isResizing })}
                                        key={id}>
                                        <div {...realColumn.getSortByToggleProps()}>
                                            {column.render('Header')}
                                            {
                                                realColumn.isSorted
                                                    ? realColumn.isSortedDesc ? ' ↓' : ' ↑'
                                                    : null
                                            }
                                        </div>
                                        { idx !== headerGroup.headers.length - 1 &&
                                            <div {...realColumn.getResizerProps()} className="connections-resizer" />
                                        }
                                    </div>
                                )
                            })
                        }
                    </div>

                    <div {...getTableBodyProps()} className="connections-body">
                        {
                            rows.map((row, i) => {
                                prepareRow(row)
                                return (
                                    <div {...row.getRowProps()} className="connections-item" key={i}>
                                        {
                                            row.cells.map((cell, j) => {
                                                const classname = classnames(
                                                    'connections-block',
                                                    { center: shouldCenter.has(cell.column.id), completed: row.original.completed }
                                                )
                                                return (
                                                    <div {...cell.getCellProps()} className={classname} key={j}>
                                                        { renderCell(cell)}
                                                    </div>
                                                )
                                            })
                                        }
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            </Card>
            <Modal title={t('closeAll.title')} show={visible} onClose={hide} onOk={handleCloseConnections}>{t('closeAll.content')}</Modal>
        </div>
    )
}
