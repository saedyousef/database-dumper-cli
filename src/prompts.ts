import prompts, { PromptObject } from 'prompts';
import { DatabaseConfig } from './types.js';
import { getFlagCatalog } from './flagsCatalog.js';

export async function promptMainMenu(hasConfigs: boolean): Promise<string> {
  const choices = hasConfigs
    ? [
        { title: 'Use existing config → Dump', value: 'use' },
        { title: 'Update a configuration', value: 'update' },
        { title: 'Add new configuration', value: 'add' },
        { title: 'Delete configuration', value: 'delete' },
        { title: 'Export configuration', value: 'export' },
        { title: 'Change defaults', value: 'defaults' },
        { title: 'Exit', value: 'exit' },
      ]
    : [
        { title: 'Create configuration (required)', value: 'add' },
        { title: 'Exit', value: 'exit' },
      ];

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices,
  });
  return action;
}

export async function promptSelectDatabase(databases: DatabaseConfig[]): Promise<DatabaseConfig | undefined> {
  if (!databases.length) return undefined;
  const { selectedId } = await prompts({
    type: 'select',
    name: 'selectedId',
    message: 'Select a database',
    choices: databases.map((db) => ({
      title: `${db.environment} · ${db.alias || db.name} (${db.host})`,
      value: db.id,
    })),
  });
  return databases.find((d) => d.id === selectedId);
}

export interface DatabaseFormResult {
  environment: string;
  name: string;
  alias?: string;
  host: string;
  port?: number;
  username: string;
  password?: string;
  selectedFlagIds: string[];
  customFlags: string[];
  gzipDefault: boolean;
  runTest: boolean;
}

export async function promptDatabaseForm(
  existing?: Partial<DatabaseConfig>,
  options?: { passwordOptional?: boolean; runTestInitial?: boolean }
): Promise<DatabaseFormResult> {
  const questions: PromptObject[] = [
    { type: 'text', name: 'environment', message: 'Environment', initial: existing?.environment || 'local', validate: (v: string) => (!!v ? true : 'Required') },
    { type: 'text', name: 'name', message: 'Database name', initial: existing?.name, validate: (v: string) => (!!v ? true : 'Required') },
    { type: 'text', name: 'alias', message: 'Alias (display only)', initial: existing?.alias || '', },
    { type: 'text', name: 'host', message: 'Host', initial: existing?.host || 'localhost', validate: (v: string) => (!!v ? true : 'Required') },
    { type: 'number', name: 'port', message: 'Port (default 3306)', initial: existing?.port || 3306 },
    { type: 'text', name: 'username', message: 'Username', initial: existing?.username || '', validate: (v: string) => (!!v ? true : 'Required') },
    {
      type: 'password',
      name: 'password',
      message: options?.passwordOptional ? 'Password (leave blank to keep existing)' : 'Password',
      validate: (v: string) => (options?.passwordOptional ? true : !!v || 'Required'),
    },
  ];

  const answers = await prompts(questions);

  const { selectedFlagIds, customFlags } = await promptFlagPicker(existing?.selectedFlags, existing?.customFlags);
  const { gzipDefault } = await prompts({
    type: 'toggle',
    name: 'gzipDefault',
    message: 'Enable gzip by default?',
    initial: existing?.gzipDefault ?? false,
    active: 'yes',
    inactive: 'no',
  });

  const { runTest } = await prompts({
    type: 'toggle',
    name: 'runTest',
    message: 'Test connection now?',
    initial: options?.runTestInitial ?? true,
    active: 'yes',
    inactive: 'skip',
  });

  return {
    environment: answers.environment,
    name: answers.name,
    alias: answers.alias || undefined,
    host: answers.host,
    port: answers.port ? Number(answers.port) : undefined,
    username: answers.username,
    password: answers.password,
    selectedFlagIds,
    customFlags,
    gzipDefault,
    runTest,
  };
}

export async function promptFlagPicker(existingSelected?: string[], existingCustom?: string[]) {
  const catalog = getFlagCatalog();
  const selectedSet = new Set(existingSelected || catalog.filter((f) => f.defaultSelected).map((f) => f.id));
  const { flagIds } = await prompts({
    type: 'multiselect',
    name: 'flagIds',
    message: 'Select mysqldump flags',
    hint: 'Space to toggle, enter to confirm',
    choices: catalog.map((f) => ({
      title: `${f.flag} — ${f.label}` + (f.caution ? ` [${f.caution}]` : ''),
      value: f.id,
      selected: selectedSet.has(f.id),
    })),
  });

  const { customRaw } = await prompts({
    type: 'text',
    name: 'customRaw',
    message: 'Custom flags (space/comma separated, optional)',
    initial: (existingCustom || []).join(' '),
  });
  const customFlags = (customRaw || '')
    .split(/[,\s]+/)
    .map((c: string) => c.trim())
    .filter(Boolean);

  return { selectedFlagIds: flagIds || [], customFlags };
}

export async function promptExcludeTables(): Promise<string[]> {
  const { tables } = await prompts({
    type: 'text',
    name: 'tables',
    message: 'Tables to exclude (comma-separated, optional)',
  });
  if (!tables) return [];
  return String(tables)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function promptOutputPath(defaultPath: string): Promise<string> {
  const { output } = await prompts({
    type: 'text',
    name: 'output',
    message: 'Output file path',
    initial: defaultPath,
  });
  return output || defaultPath;
}

export async function promptGzip(defaultValue: boolean): Promise<boolean> {
  const { gzip } = await prompts({
    type: 'toggle',
    name: 'gzip',
    message: 'Compress with gzip?',
    initial: defaultValue,
    active: 'yes',
    inactive: 'no',
  });
  return !!gzip;
}

export async function promptPasswordOverride(): Promise<{ password?: string; persist?: boolean }> {
  const { shouldOverride } = await prompts({
    type: 'toggle',
    name: 'shouldOverride',
    message: 'Override password for this run?',
    initial: false,
    active: 'yes',
    inactive: 'no',
  });
  if (!shouldOverride) return {};
  const { password, persist } = await prompts([
    { type: 'password', name: 'password', message: 'New password', validate: (v: string) => (!!v ? true : 'Required') },
    { type: 'toggle', name: 'persist', message: 'Persist this password to config?', initial: false, active: 'yes', inactive: 'no' },
  ]);
  return { password, persist };
}

export async function promptConfirm(message: string): Promise<boolean> {
  const { yes } = await prompts({
    type: 'toggle',
    name: 'yes',
    message,
    initial: true,
    active: 'yes',
    inactive: 'no',
  });
  return !!yes;
}

export async function promptOutputOrSkip(message: string): Promise<string | undefined> {
  const { value } = await prompts({
    type: 'text',
    name: 'value',
    message,
  });
  return value || undefined;
}
