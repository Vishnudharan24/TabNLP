
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { GitBranch, Database, Link2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const RelationshipDiagram = ({ datasets, companies }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const { nodes, links, connectionCount } = useMemo(() => {
        if (!datasets || datasets.length === 0) return { nodes: [], links: [], connectionCount: 0 };

        const nodes = datasets.map((ds) => {
            const company = companies?.find(c => c.id === ds.companyId);
            return {
                id: ds.id,
                name: ds.name,
                symbolSize: Math.max(40, Math.min(80, 30 + ds.columns.length * 3)),
                itemStyle: {
                    color: company?.color || (isDark ? '#475569' : '#94a3b8'),
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                    borderWidth: 3,
                    shadowBlur: 10,
                    shadowColor: 'rgba(0,0,0,0.15)',
                },
                label: {
                    show: true,
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: isDark ? '#e2e8f0' : '#334155',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                },
                tooltip: {
                    formatter: () => {
                        let html = `<div style="font-weight:700;margin-bottom:6px">${ds.name}</div>`;
                        html += `<div style="opacity:0.7">${ds.columns.length} columns · ${ds.data.length} rows</div>`;
                        if (company) html += `<div style="margin-top:4px;color:${company.color}">● ${company.name}</div>`;
                        html += `<div style="margin-top:6px;font-size:10px;opacity:0.6">Columns: ${ds.columns.map(c => c.name).join(', ')}</div>`;
                        return html;
                    }
                },
                category: company ? companies.indexOf(company) : (companies?.length || 0),
            };
        });

        const links = [];
        for (let i = 0; i < datasets.length; i++) {
            for (let j = i + 1; j < datasets.length; j++) {
                const ds1 = datasets[i];
                const ds2 = datasets[j];
                const cols1 = new Set(ds1.columns.map(c => c.name.toLowerCase()));
                const sharedCols = ds2.columns.filter(c => cols1.has(c.name.toLowerCase())).map(c => c.name);

                if (sharedCols.length > 0) {
                    links.push({
                        source: ds1.id,
                        target: ds2.id,
                        value: sharedCols.length,
                        lineStyle: {
                            width: Math.min(8, 1 + sharedCols.length * 2),
                            color: isDark ? '#475569' : '#94a3b8',
                            curveness: 0.2,
                        },
                        tooltip: {
                            formatter: () => {
                                let html = `<div style="font-weight:700">${ds1.name} ↔ ${ds2.name}</div>`;
                                html += `<div style="margin-top:4px">${sharedCols.length} shared column${sharedCols.length > 1 ? 's' : ''}:</div>`;
                                sharedCols.forEach(col => { html += `<div style="margin-left:8px;font-size:11px">• ${col}</div>`; });
                                return html;
                            }
                        },
                        label: {
                            show: true,
                            formatter: sharedCols.length.toString(),
                            fontSize: 10,
                            color: isDark ? '#94a3b8' : '#64748b',
                        },
                    });
                }
            }
        }

        return { nodes, links, connectionCount: links.length };
    }, [datasets, companies, isDark]);

    const categories = useMemo(() => {
        const cats = (companies || []).map(c => ({ name: c.name, itemStyle: { color: c.color } }));
        cats.push({ name: 'Unassigned', itemStyle: { color: isDark ? '#475569' : '#94a3b8' } });
        return cats;
    }, [companies, isDark]);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            textStyle: { color: isDark ? '#e2e8f0' : '#334155', fontSize: 11, fontFamily: 'Plus Jakarta Sans, sans-serif' },
            borderWidth: 1,
            padding: [12, 16],
            extraCssText: 'border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
        },
        legend: categories.length > 1 ? {
            data: categories.map(c => c.name),
            bottom: 20,
            textStyle: { color: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontFamily: 'Plus Jakarta Sans, sans-serif' },
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
        } : undefined,
        animationDuration: 1500,
        animationEasingUpdate: 'quinticInOut',
        series: [{
            type: 'graph',
            layout: 'force',
            data: nodes,
            links,
            categories,
            roam: true,
            draggable: true,
            force: {
                repulsion: 350,
                gravity: 0.1,
                edgeLength: [100, 250],
                layoutAnimation: true,
            },
            emphasis: {
                focus: 'adjacency',
                lineStyle: { width: 6 },
            },
            lineStyle: { opacity: 0.7 },
        }],
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className={`px-6 py-4 flex items-center justify-between shrink-0 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div>
                    <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <GitBranch size={12} />
                        <span>Schema</span>
                    </div>
                    <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Relationship Diagram</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                        <Database size={12} /> {datasets.length} datasets
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                        <Link2 size={12} /> {connectionCount} connections
                    </div>
                </div>
            </div>

            {/* Diagram */}
            <div className="flex-1 p-6">
                {datasets.length < 2 ? (
                    <div className="h-full flex flex-col items-center justify-center">
                        <GitBranch size={48} className={`mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                        <p className={`text-lg font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Upload at least 2 datasets</p>
                        <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>to see relationships between them.</p>
                    </div>
                ) : (
                    <div className={`h-full rounded-xl border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <ReactECharts
                            option={option}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default RelationshipDiagram;
