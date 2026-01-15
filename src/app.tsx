import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Key } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig, saveConfig, upsertDatabase, deleteDatabase, findDatabase, SCHEMA_VERSION } from './configStore.js';
import { DatabaseConfig, ConfigFile } from './types.js';
import { getFlagCatalog, resolveFlags } from './flagsCatalog.js';
import { savePassword, resolvePassword } from './secrets.js';
import { defaultDumpPath } from './outputPaths.js';
import { ensureBinary } from './binaryManager.js';
import { testConnection } from './connectionTester.js';
import { runDump } from './dumpRunner.js';

const HEADER_DIVIDER = '─'.repeat(52);
const READABLE_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const STAGE_ORDER = ['flags', 'gzip', 'connection'] as const;
type SetupStage = (typeof STAGE_ORDER)[number];
const STAGE_LABELS: Record<SetupStage, string> = {
  flags: 'Select flags',
  gzip: 'Gzip by default',
  connection: 'Connection test',
};
const STAGE_FOOTERS: Record<SetupStage, string> = {
  flags: 'Space toggles flags; Enter continues; Esc cancels.',
  gzip: 'Enter continues; Esc goes back to flags.',
  connection: 'Enter saves configuration; Esc goes back to gzip.',
};
const TOOL_FOOTER_TEXT = 'This CLI tool designed with ❤️ by Saed Yousef · https://github.com/saedyousef/database-dumper-cli';

const formatHumanDate = (iso: string) => {
  try {
    return READABLE_DATE.format(new Date(iso));
  } catch (err) {
    return iso;
  }
};

// Simple menu with arrow navigation

function Menu({ items, onSelect }: { items: { label: string; value: string; hint?: string }[]; onSelect: (v: string) => void }) {
  const [index, setIndex] = useState(0);
  useInput((_, key: Key) => {
    if (key.upArrow) setIndex((i) => (i === 0 ? items.length - 1 : i - 1));
    if (key.downArrow) setIndex((i) => (i === items.length - 1 ? 0 : i + 1));
    if (key.return) onSelect(items[index].value);
  });
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      {items.map((item, i) => {
        const active = i === index;
        return (
          <Box key={item.value} flexDirection="row" alignItems="center" marginBottom={0}>
            <Text color={active ? 'cyan' : 'white'}>{active ? '▸' : ' '}</Text>
            <Box marginLeft={1} flexDirection="column">
              <Text color={active ? 'whiteBright' : 'white'}>
                {active ? chalk.bold(item.label) : item.label}
              </Text>
            </Box>
            {item.hint ? (
              <Box marginLeft={2}>
                <Text color="gray" dimColor>
                  {item.hint}
                </Text>
              </Box>
            ) : null}
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ arrows and Enter to choose</Text>
      </Box>
    </Box>
  );
}


function Toggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  useInput((input: string, key: Key) => {
    if (key.return || input === ' ') onToggle();
  });
  const statusLabel = value ? 'Enabled' : 'Disabled';
  return (
    <Box marginTop={1} flexDirection="row" alignItems="center">
      <Text color="whiteBright">
        {label}:{' '}
      </Text>
      <Text color={value ? 'green' : 'yellow'}>
        {chalk.bold(`[${statusLabel}]`)}
      </Text>
      <Box marginLeft={1}>
        <Text dimColor>(space or Enter)</Text>
      </Box>
    </Box>
  );
}


function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string; desc: string; caution?: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [index, setIndex] = useState(0);
  useInput((input: string, key: Key) => {
    if (key.upArrow) setIndex((i) => (i === 0 ? options.length - 1 : i - 1));
    if (key.downArrow) setIndex((i) => (i === options.length - 1 ? 0 : i + 1));
    if (input === ' ') {
      const opt = options[index];
      const next = new Set(selected);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.add(opt.id);
      onChange(next);
    }
  });
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      {options.map((opt, i) => {
        const activeOption = i === index;
        const checked = selected.has(opt.id);
        const prefix = activeOption ? chalk.cyan('›') : ' ';
        return (
          <Text key={opt.id} color={activeOption ? 'cyan' : 'white'}>
            {prefix} {checked ? chalk.green('[x]') : '[ ]'} {opt.label} {chalk.dim(opt.desc)}
            {opt.caution ? chalk.yellow(` · ${opt.caution}`) : ''}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ arrows and space/Enter to toggle</Text>
      </Box>
    </Box>
  );
}


function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <Text>{chalk.white.bold(title)}</Text>
        <Text>{subtitle ? chalk.cyanBright.dim(subtitle) : chalk.cyanBright.dim('Guiding dumps with clarity.')}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{HEADER_DIVIDER}</Text>
      </Box>
    </Box>
  );
}


function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      <Text>{chalk.bold(title)}</Text>
      <Box marginTop={1} flexDirection="column" marginLeft={1}>
        {children}
      </Box>
    </Box>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text>{chalk.dim(text)}</Text>
    </Box>
  );
}

function UseEnter({ onEnter }: { onEnter: () => void }) {

  useInput((_, key: Key) => {
    if (key.return) onEnter();
  });
  return null;
}

type View =
  | 'loading'
  | 'menu'
  | 'list'
  | 'create'
  | 'update-select'
  | 'update'
  | 'delete'
  | 'export'
  | 'dump-choose'
  | 'dump-setup'
  | 'progress'
  | 'message';


interface AppProps {
  configPath?: string;
  selectId?: string;
}

export default function App({ configPath, selectId }: AppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<View>('loading');
  const [config, setConfig] = useState<ConfigFile | null>(null);
  const [selectedDb, setSelectedDb] = useState<DatabaseConfig | null>(null);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [progressText, setProgressText] = useState<string>('');
  const [progressDone, setProgressDone] = useState<boolean>(false);

  const [fieldIndex, setFieldIndex] = useState(0);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [flagSelection, setFlagSelection] = useState<Set<string>>(new Set());
  const [gzipDefault, setGzipDefault] = useState(false);
  const [runTest, setRunTest] = useState(true);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [editingDb, setEditingDb] = useState<DatabaseConfig | null>(null);
  const [setupStage, setSetupStage] = useState<(typeof STAGE_ORDER)[number]>('flags');

  const [dumpGzip, setDumpGzip] = useState(false);

  const [dumpOutputPath, setDumpOutputPath] = useState('');
  const [dumpExcludes, setDumpExcludes] = useState('');
  const [dumpPassword, setDumpPassword] = useState('');
  const [dumpRunTest, setDumpRunTest] = useState(true);

  // Load config
  useEffect(() => {
    (async () => {
      const cfg = await loadConfig(configPath);
      if (!cfg.version) cfg.version = SCHEMA_VERSION;
      setConfig(cfg);
      if (selectId) {
        const db = findDatabase(cfg, selectId);
        if (db) {
          await beginDumpSetup(db, cfg);
          return;
        }
      }
      setView(cfg.databases.length ? 'menu' : 'create');
    })().catch((err) => {
      setError(err.message || String(err));
      setView('message');
    });
  }, [configPath, selectId]);

  // Global key handling
  useInput((input: string, key: Key) => {
    if (view === 'message') {
      if (key.escape || input === 'q') exit();
      else setView('menu');
      return;
    }
    if (view === 'create' || view === 'update') {
      if (currentField && key.escape) {
        if (fieldIndex > 0) {
          setFieldIndex((i) => i - 1);
        } else {
          setView('menu');
        }
        return;
      }
      if (!currentField && key.escape) {
        const idx = STAGE_ORDER.indexOf(setupStage);
        if (idx > 0) {
          setSetupStage(STAGE_ORDER[idx - 1]);
        } else {
          setView('menu');
        }
        return;
      }
    }
    if (key.escape) {
      if (view === 'dump-setup') {
        setView('dump-choose');
        return;
      }
      if (view === 'list' || view === 'delete') {
        setView('menu');
        return;
      }
      if (view === 'dump-choose' || view === 'update-select') {
        setView('menu');
        return;
      }
      if (view === 'progress') {
        setView('menu');
        return;
      }
    }
  });


  // Field definitions
  const fields = useMemo(
    () => [
      { key: 'environment', label: 'Environment', required: true, type: 'text' as const },
      { key: 'name', label: 'Database name', required: true, type: 'text' as const },
      { key: 'alias', label: 'Alias (optional)', required: false, type: 'text' as const },
      { key: 'host', label: 'Host', required: true, type: 'text' as const },
      { key: 'port', label: 'Port', required: false, type: 'number' as const },
      { key: 'username', label: 'Username', required: true, type: 'text' as const },
      { key: 'password', label: isUpdateMode ? 'Password (leave blank to keep)' : 'Password', required: !isUpdateMode, type: 'password' as const },
      { key: 'customFlags', label: 'Custom flags (space/comma separated)', required: false, type: 'text' as const },
    ],
    [isUpdateMode]
  );

  // Wizard setup when entering create/update
  useEffect(() => {
    if (view === 'create') {
      setIsUpdateMode(false);
      setEditingDb(null);
    }
    if (view === 'create' || view === 'update') {
      const defaults = editingDb || null;
      const flagsDefault = defaults?.selectedFlags?.length
        ? new Set(defaults.selectedFlags)
        : new Set(getFlagCatalog().filter((f) => f.defaultSelected).map((f) => f.id));
      setFlagSelection(flagsDefault);
      setGzipDefault(defaults?.gzipDefault ?? false);
      setRunTest(true);
      setSetupStage('flags');
      setFieldIndex(0);
      setFieldValues({

        environment: defaults?.environment || 'local',
        name: defaults?.name || '',
        alias: defaults?.alias || '',
        host: defaults?.host || 'localhost',
        port: defaults?.port ? String(defaults.port) : '3306',
        username: defaults?.username || '',
        password: '',
        customFlags: defaults?.customFlags?.join(' ') || '',
      });
    }
  }, [view, editingDb]);

  const currentField = fields[fieldIndex];

  const handleFieldSubmit = () => {
    if (currentField) {
      const val = fieldValues[currentField.key] || '';
      if (currentField.required && !val.trim()) return;
      setFieldIndex((i) => i + 1);
    }
  };

  const handleFlagsDone = async () => {
    if (!config) return;
    const now = new Date().toISOString();
    const customFlags = (fieldValues.customFlags || '')
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    const db: DatabaseConfig = {
      id: editingDb?.id || uuidv4(),
      dbType: 'mysql',
      environment: fieldValues.environment,
      name: fieldValues.name,
      alias: fieldValues.alias || undefined,
      host: fieldValues.host,
      port: Number(fieldValues.port) || undefined,
      username: fieldValues.username,
      passwordRef: editingDb?.passwordRef || '',
      selectedFlags: Array.from(flagSelection),
      customFlags,
      gzipDefault,
      createdAt: editingDb?.createdAt || now,
      updatedAt: now,
    };

    const passwordVal = fieldValues.password || '';
    if (passwordVal) {
      const saved = await savePassword(passwordVal, editingDb?.passwordRef);
      db.passwordRef = saved.ref;
    }

    upsertDatabase(config, db);
    await saveConfig(config, configPath);
    setConfig({ ...config });

    const buildMessage = (base: string) =>
      `${base} Created ${formatHumanDate(db.createdAt)} • Last updated ${formatHumanDate(db.updatedAt)}`;
    const savedLabel = editingDb ? 'Configuration updated' : 'Configuration saved';
    if (runTest) {
      try {
        setProgressText('Testing connection...');
        setProgressDone(false);
        setView('progress');
        const binaryPath = await ensureBinary();
        const pw = passwordVal || (await resolvePassword(db.passwordRef)) || '';
        const flags = resolveFlags(db.selectedFlags, db.customFlags);
        const result = await testConnection({
          db,
          password: pw,
          binaryPath,
          gzip: false,
          excludeTables: [],
          flags,
          outputPath: '',
        });
        if (!result.ok) throw new Error(result.message || 'Connection test failed');
        setMessage(buildMessage(`${savedLabel} and connection test succeeded.`));
        setView('message');
        return;
      } catch (err: any) {
        setError(err?.message || 'Connection test failed');
        setView('message');
        return;
      }
    }

    setMessage(buildMessage(`${savedLabel}.`));
    setView('message');
  };


  const beginDumpSetup = async (db: DatabaseConfig, cfg?: ConfigFile) => {
    const resolved = (await resolvePassword(db.passwordRef)) || '';
    setSelectedDb(db);
    setDumpGzip(db.gzipDefault ?? false);
    const rootCfg = cfg || config;
    const defaultPath = defaultDumpPath(db.environment, db.alias || db.name, db.gzipDefault ?? false, rootCfg?.defaults?.dumpRootOverride);
    setDumpOutputPath(defaultPath);
    setDumpExcludes('');
    setDumpPassword(resolved);
    setDumpRunTest(true);
    setView('dump-setup');
  };

  const runDumpFlow = async () => {
    if (!config || !selectedDb) return;
    const password = dumpPassword || (await resolvePassword(selectedDb.passwordRef)) || '';
    if (!password) {
      setError('Password required to run dump.');
      setView('message');
      return;
    }
    try {
      setProgressDone(false);
      setProgressText('Resolving mysqldump binary');
      setView('progress');
      const binaryPath = await ensureBinary();
      const flags = resolveFlags(selectedDb.selectedFlags, selectedDb.customFlags);
      const excludeTables = dumpExcludes
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const request = {
        db: selectedDb,
        password,
        binaryPath,
        gzip: dumpGzip,
        excludeTables,
        flags,
        outputPath: dumpOutputPath,
      };
      if (dumpRunTest) {
        setProgressText('Testing connection...');
        const ok = await testConnection(request);
        if (!ok.ok) throw new Error(ok.message || 'Connection test failed');
      }
      setProgressText('Running dump...');
      const result = await runDump(request);
      setProgressDone(true);
      setMessage(`Dump completed: ${result.outputPath}`);
      setView('message');
    } catch (err: any) {
      setProgressDone(true);
      setError(err?.message || String(err));
      setView('message');
    }
  };

  // --- Renders ---
  if (view === 'loading' || !config) {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Loading configuration..." />
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" /> Loading...
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === 'progress') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Working..." />
        <Box marginTop={1}>
          <Text color={progressDone ? 'green' : 'cyan'}>
            {!progressDone ? <Spinner type="dots" /> : null} {progressText}
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === 'message') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Status" />
        <Box marginTop={1} flexDirection="column">
          {message ? <Text color="green">{message}</Text> : null}
          {error ? <Text color="red">{error}</Text> : null}
          <Text dimColor>Press any key to return to menu, or q/Esc to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (view === 'menu') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle={`Configs: ${config.databases.length}`} />
        <Step title="Choose an action">
          <Menu
            items={[
              { label: 'Dump database', value: 'dump', hint: 'Select and run dump' },
              { label: 'List configurations', value: 'list', hint: 'Show creation and update dates' },
              { label: 'Add configuration', value: 'create' },
              { label: 'Update configuration', value: 'update' },
              { label: 'Delete configuration', value: 'delete' },
              { label: 'Export configuration', value: 'export' },
              { label: 'Exit', value: 'exit' },
            ]}
            onSelect={(val) => {
              switch (val) {
                case 'dump':
                  if (!config.databases.length) {
                    setError('No configurations found. Create one first.');
                    setView('message');
                  } else setView('dump-choose');
                  break;
                case 'create':
                  setIsUpdateMode(false);
                  setEditingDb(null);
                  setView('create');
                  break;
                case 'list':
                  if (!config.databases.length) {
                    setError('No configurations stored yet.');
                    setView('message');
                  } else setView('list');
                  break;
                case 'update':
                  if (!config.databases.length) {
                    setError('No configurations to update.');
                    setView('message');
                  } else setView('update-select');
                  break;
                case 'delete':
                  if (!config.databases.length) {
                    setError('No configurations to delete.');
                    setView('message');
                  } else setView('delete');
                  break;
                case 'export':
                  setDumpOutputPath('config-export.json');
                  setView('export');
                  break;
                case 'exit':
                  exit();
                  break;
                default:
                  break;
              }
            }}
          />
        </Step>
        <Footer text="Use arrow keys to move, Enter to select, q/Esc to exit." />
        <Footer text={TOOL_FOOTER_TEXT} />
      </Box>
    );
  }

  if (view === 'list') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Stored configurations" />
        <Step title="Configurations">
          {config.databases.map((db) => (
            <Box key={db.id} flexDirection="column" marginBottom={1}>
              <Text>{`${db.environment} · ${db.alias || db.name} (${db.host})`}</Text>
              <Text dimColor>
                {`Created ${formatHumanDate(db.createdAt)} · Updated ${formatHumanDate(db.updatedAt)}`}
              </Text>
            </Box>
          ))}
        </Step>
        <Footer text="Esc to return to menu." />
        <Footer text={TOOL_FOOTER_TEXT} />
      </Box>
    );
  }

  
  if (view === 'dump-choose') {

    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Select configuration" />
        <Menu
          items={config.databases.map((d) => ({ label: `${d.environment} · ${d.alias || d.name} (${d.host})`, value: d.id }))}
          onSelect={(id) => {
            const db = config.databases.find((d) => d.id === id);
            if (db) beginDumpSetup(db);
          }}
        />
      </Box>
    );
  }

  if (view === 'dump-setup' && selectedDb) {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle={`Dump: ${selectedDb.environment} · ${selectedDb.alias || selectedDb.name}`} />
        <Step title="Password">
          <TextInput value={dumpPassword} mask="*" onChange={setDumpPassword} onSubmit={() => {}} />
          <Text dimColor>Stored password prefilled; edit to override.</Text>
        </Step>
        <Step title="Output path">
          <TextInput value={dumpOutputPath} onChange={setDumpOutputPath} onSubmit={() => {}} />
        </Step>
        <Step title="Exclude tables (comma/space separated)">
          <TextInput value={dumpExcludes} onChange={setDumpExcludes} onSubmit={() => {}} />
        </Step>
        <Step title="Gzip">
          <Toggle label="Enable gzip" value={dumpGzip} onToggle={() => setDumpGzip((v) => !v)} />
        </Step>
        <Step title="Connection test">
          <Toggle label="Run connection test" value={dumpRunTest} onToggle={() => setDumpRunTest((v) => !v)} />
        </Step>
        <Box marginTop={1}>
          <Text color="green">Press Enter to start dump</Text>
        </Box>
        <UseEnter onEnter={runDumpFlow} />
        <Footer text="Press Enter to run the dump; Esc or q to go back." />
      </Box>
    );
  }


  if (view === 'update-select') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Select configuration to update" />
        <Menu
          items={config.databases.map((d) => ({ label: `${d.environment} · ${d.alias || d.name}`, value: d.id }))}
          onSelect={(id) => {
            const db = config.databases.find((d) => d.id === id) || null;
            setEditingDb(db);
            setIsUpdateMode(true);
            setView('update');
          }}
        />
        <Footer text="Select a configuration to edit; Esc to return to menu." />
      </Box>
    );
  }


  if ((view === 'create' || view === 'update') && currentField) {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle={isUpdateMode ? 'Update configuration' : 'Create configuration'} />
        <Step title={`Field ${fieldIndex + 1} of ${fields.length}: ${currentField.label}`}>
          <TextInput
            value={fieldValues[currentField.key] || ''}
            onChange={(val: string) => setFieldValues((prev) => ({ ...prev, [currentField.key]: val }))}
            onSubmit={handleFieldSubmit}
            mask={currentField.key === 'password' ? '*' : undefined}
          />
          {currentField.required ? <Text dimColor>Required</Text> : <Text dimColor>Optional</Text>}
        </Step>
        <Footer text="Enter to save this field; Esc aborts." />
      </Box>
    );
  }


  if ((view === 'create' || view === 'update') && !currentField) {
    const catalog = getFlagCatalog();
    const totalSteps = fields.length + STAGE_ORDER.length;
    const stageIndex = STAGE_ORDER.indexOf(setupStage);
    const stageTitle = STAGE_LABELS[setupStage];
    const stepNumber = fields.length + stageIndex + 1;
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle={isUpdateMode ? 'Update configuration' : 'Create configuration'} />
        <Step title={`Step ${stepNumber}/${totalSteps}: ${stageTitle}`}>
          {setupStage === 'flags' && (
            <MultiSelect
              options={catalog.map((f) => ({ id: f.id, label: f.flag, desc: f.label, caution: f.caution }))}
              selected={flagSelection}
              onChange={setFlagSelection}
            />
          )}
          {setupStage === 'gzip' && (
            <Toggle label="Gzip" value={gzipDefault} onToggle={() => setGzipDefault((v) => !v)} />
          )}
          {setupStage === 'connection' && (
            <Toggle label="Run connection test after save" value={runTest} onToggle={() => setRunTest((v) => !v)} />
          )}
        </Step>
        {setupStage === 'flags' && (
          <>
            <Box marginTop={1}>
              <Text color="green">Enter to continue to gzip settings.</Text>
            </Box>
            <UseEnter onEnter={() => setSetupStage('gzip')} />
          </>
        )}
        {setupStage === 'gzip' && (
          <>
            <Box marginTop={1}>
              <Text color="green">Enter to continue to connection test.</Text>
            </Box>
            <UseEnter onEnter={() => setSetupStage('connection')} />
          </>
        )}
        {setupStage === 'connection' && (
          <>
            <Box marginTop={1}>
              <Text color="green">Enter to save configuration.</Text>
            </Box>
            <UseEnter onEnter={handleFlagsDone} />
          </>
        )}
        <Footer text={STAGE_FOOTERS[setupStage]} />
      </Box>
    );
  }



  if (view === 'delete') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Delete configuration" />
        <Menu
          items={config.databases.map((d) => ({ label: `${d.environment} · ${d.alias || d.name}`, value: d.id }))}
          onSelect={async (id) => {
            deleteDatabase(config, id);
            await saveConfig(config, configPath);
            setConfig({ ...config });
            setMessage('Configuration deleted.');
            setView('message');
          }}
        />
        <Footer text="Deleting is permanent; Esc cancels." />
      </Box>
    );
  }


  if (view === 'export') {
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle="Export configuration" />
        <Step title="Path">
          <TextInput value={dumpOutputPath} onChange={setDumpOutputPath} onSubmit={() => {}} />
          <Text dimColor>Enter destination path for exported JSON</Text>
        </Step>
        <Box marginTop={1}>
          <Text color="green">Press Enter to export</Text>
        </Box>
        <UseEnter
          onEnter={async () => {
            const dest = path.resolve(dumpOutputPath || 'config-export.json');
            await fs.ensureDir(path.dirname(dest));
            await fs.writeFile(dest, JSON.stringify(config, null, 2));
            setMessage(`Exported to ${dest}`);
            setView('message');
          }}
        />
        <Footer text="Enter to export configuration; Esc cancels." />
      </Box>
    );
  }


  return (
    <Box>
      <Text>Unsupported view</Text>
    </Box>
  );
}
