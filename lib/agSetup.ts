import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

// AG Grid 33+ needs modules registered once. Importing this file anywhere is enough.
ModuleRegistry.registerModules([AllCommunityModule]);
