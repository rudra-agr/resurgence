import { ModuleRegistry, AllCommunityModule } from 'ag-charts-community';

// AG Charts 13+ needs modules registered once, like AG Grid. Import this wherever AgCharts is used.
ModuleRegistry.registerModules([AllCommunityModule]);
