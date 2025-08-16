// /static/src/data/metadataSchema.js
// Declarative field schema for the metadata editor.
import { LandmarkEnum, EncounterTables, Factions } from './biomeRegistry.js';

export const tileMetadataSchema = [
  {
    title: 'Core',
    layout: 'grid-2',
    fields: [
      { key:'type',       label:'Type',       kind:'string',  placeholder:'e.g., plains' },
      { key:'elevation',  label:'Elevation',  kind:'number',  min:0, max:99, step:1 },
      { key:'passable',   label:'Passable',   kind:'boolean' },
    ],
  },
  {
    title: 'Gameplay',
    layout: 'grid-2',
    fields: [
      { key:'spawnLevel',    label:'Spawn Lv',     kind:'number', min:0, max:99, step:1 },
      { key:'ownerFaction',  label:'Owner',        kind:'enum',   options: Factions },
      { key:'encounterTable',label:'Encounter Tbl',kind:'enum',   options: EncounterTables },
      { key:'landmark',      label:'Landmark',     kind:'enum',   options: LandmarkEnum },
    ],
  },
  {
    title: 'Lists',
    layout: 'stack',
    fields: [
      { key:'resources', label:'Resources', kind:'string[]', placeholder:'wood, ore' },
      { key:'tags',      label:'Tags',      kind:'string[]', placeholder:'high, ruins' },
    ],
  },
];
