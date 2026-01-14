import { FlagOption } from './types.js';

const CATALOG: FlagOption[] = [
  {
    id: 'single-transaction',
    flag: '--single-transaction',
    label: 'Single transaction',
    description: 'Consistent snapshot without locking tables (InnoDB)',
    defaultSelected: true,
  },
  {
    id: 'quick',
    flag: '--quick',
    label: 'Stream rows',
    description: 'Retrieve rows directly from server to stdout',
    defaultSelected: true,
  },
  {
    id: 'routines',
    flag: '--routines',
    label: 'Include routines',
    description: 'Dump stored procedures and functions',
  },
  {
    id: 'triggers',
    flag: '--triggers',
    label: 'Include triggers',
    description: 'Dump triggers',
  },
  {
    id: 'events',
    flag: '--events',
    label: 'Include events',
    description: 'Dump events',
  },
  {
    id: 'set-gtid-off',
    flag: '--set-gtid-purged=OFF',
    label: 'GTID purged OFF',
    description: 'Avoid GTID statements for portability',
    defaultSelected: true,
  },
  {
    id: 'hex-blob',
    flag: '--hex-blob',
    label: 'Hex encode blobs',
    description: 'Dump binary data as hex',
  },
  {
    id: 'column-statistics',
    flag: '--column-statistics=0',
    label: 'Disable column statistics',
    description: 'Avoid histogram queries (compatibility)',
    defaultSelected: true,
  },
  {
    id: 'master-data',
    flag: '--master-data=2',
    label: 'Master data (binlog pos)',
    description: 'Include CHANGE MASTER log position (may lock briefly)',
    caution: 'Enables binlog position; ensure server permissions and implications.',
  },
  {
    id: 'skip-lock-tables',
    flag: '--skip-lock-tables',
    label: 'Skip lock tables',
    description: 'Do not lock tables (not consistent for MyISAM)',
  },
  {
    id: 'add-drop-table',
    flag: '--add-drop-table',
    label: 'Add DROP TABLE',
    description: 'Include DROP TABLE statements',
    defaultSelected: true,
  },
  {
    id: 'no-create-db',
    flag: '--no-create-db',
    label: 'No CREATE DATABASE',
    description: 'Omit CREATE DATABASE from dump',
  },
  {
    id: 'charset-utf8mb4',
    flag: '--default-character-set=utf8mb4',
    label: 'UTF8MB4',
    description: 'Set default character set to utf8mb4',
    defaultSelected: true,
  },
];

export function getFlagCatalog(): FlagOption[] {
  return [...CATALOG];
}

export function resolveFlags(selectedIds: string[], customFlags?: string[]): string[] {
  const idSet = new Set(selectedIds);
  const picked = CATALOG.filter((f) => idSet.has(f.id)).map((f) => f.flag);
  return customFlags && customFlags.length ? [...picked, ...customFlags] : picked;
}
