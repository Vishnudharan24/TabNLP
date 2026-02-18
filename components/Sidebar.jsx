
import React from 'react';
import {
    PieChart,
    Layers,
    Database,
    BarChart2,
    Layout,
    Merge
} from 'lucide-react';

const SidebarItem = ({
    icon: Icon,
    active = false,
    label,
    onClick
}) => (
    <div className="px-3 mb-1" onClick={onClick}>
        <div className={`p-3 cursor-pointer group flex items-center gap-4 relative transition-all duration-300 rounded-2xl ${active ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'}`}>
            <Icon size={22} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
            <span className={`text-[13px] font-bold whitespace-nowrap overflow-hidden transition-all duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {label}
            </span>
            {active && <div className="absolute right-3 h-1 w-1 bg-gray-700 dark:bg-gray-300 rounded-full"></div>}
        </div>
    </div>
);

const Sidebar = ({ setView, currentView }) => {
    return (
        <aside className="w-20 hover:w-64 glass-panel border-r border-gray-200 dark:border-gray-700 flex flex-col h-full transition-all duration-500 ease-in-out group z-40 relative">
            <div className="flex-1 py-10 overflow-x-hidden">
                
                <SidebarItem
                    icon={Layers}
                    label="Data Hub"
                    active={currentView === 'data'}
                    onClick={() => setView('data')}
                />

                <SidebarItem
                    icon={Merge}
                    label="Merge Data"
                    active={currentView === 'merge'}
                    onClick={() => setView('merge')}
                />

                <SidebarItem
                    icon={PieChart}
                    label="Report View"
                    active={currentView === 'report'}
                    onClick={() => setView('report')}
                />

                <div className="mx-6 my-6 h-[1px] bg-gray-200 dark:bg-gray-700 opacity-60" />

            </div>

            <div className="pb-10 overflow-x-hidden">
                <SidebarItem icon={Layout} label="Settings" />
            </div>
        </aside>
    );
};

export default Sidebar;
