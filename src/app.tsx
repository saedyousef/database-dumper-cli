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

// Simple menu with arrow navigation
function Menu({ items, onSelect }: { items: { label: string; value: string; hint?: string }[]; onSelect: (v: string) => void }) {
  const [index, setIndex] = useState(0);
  useInput((_, key: Key) => {
    if (key.upArrow) setIndex((i) => (i === 0 ? items.length - 1 : i - 1));
    if (key.downArrow) setIndex((i) => (i === items.length - 1 ? 0 : i + 1));
    if (key.return) onSelect(items[index].value);
  });
  return (
    <Box flexDirection="column" marginTop={1}>
      {items.map((item, i) => (
        <Text key={item.value} color={i === index ? 'cyan' : undefined}>
          {i === index ? '› ' : '  '}
          {item.label} {item.hint ? chalk.dim(`· ${item.hint}`) : ''}
        </Text>
      ))}
      <Text dimColor>Use ↑/↓ then Enter</Text>
    </Box>
  );
}

function Toggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  useInput((input: string, key: Key) => {
    if (key.return || input === ' ') onToggle();
  });
  return (
    <Text>
      {label}: <Text color="cyan">[{value ? 'on' : 'off'}]</Text> (space/enter)
    </Text>
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
    if (key.return || input === ' ') {
      const opt = options[index];
      const next = new Set(selected);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.add(opt.id);
      onChange(next);
    }
  });
  return (
    <Box flexDirection="column" marginTop={1}>
      {options.map((opt, i) => (
        <Text key={opt.id}>
          {i === index ? chalk.cyan('›') : ' '} {selected.has(opt.id) ? chalk.green('[x]') : '[ ]'} {opt.label} {chalk.dim(opt.desc)}
          {opt.caution ? chalk.yellow(` · ${opt.caution}`) : ''}
        </Text>
      ))}
      <Text dimColor>↑/↓ to move, space/enter to toggle</Text>
    </Box>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0}>
      <Text>{chalk.bold(title)}</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{chalk.bold(title)}</Text>
      <Box marginLeft={2} flexDirection="column">
        {children}
      </Box>
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
        setMessage('Configuration saved and connection test succeeded.');
        setView('message');
        return;
      } catch (err: any) {
        setError(err?.message || 'Connection test failed');
        setView('message');
        return;
      }
    }

    setMessage('Configuration saved.');
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
          <UseEnter onEnter={handleFieldSubmit} />
        </Step>
      </Box>
    );
  }

  if ((view === 'create' || view === 'update') && !currentField) {
    const catalog = getFlagCatalog();
    return (
      <Box flexDirection="column">
        <Header title="Database Dumper CLI" subtitle={isUpdateMode ? 'Update configuration' : 'Create configuration'} />
        <Step title="Select flags">
          <MultiSelect
            options={catalog.map((f) => ({ id: f.id, label: f.flag, desc: f.label, caution: f.caution }))}
            selected={flagSelection}
            onChange={setFlagSelection}
          />
        </Step>
        <Step title="Gzip by default">
          <Toggle label="Gzip" value={gzipDefault} onToggle={() => setGzipDefault((v) => !v)} />
        </Step>
        <Step title="Connection test">
          <Toggle label="Run connection test after save" value={runTest} onToggle={() => setRunTest((v) => !v)} />
        </Step>
        <Box marginTop={1}>
          <Text color="green">Press Enter to save configuration</Text>
        </Box>
        <UseEnter onEnter={handleFlagsDone} />
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
      </Box>
    );
  }

  return (
    <Box>
      <Text>Unsupported view</Text>
    </Box>
  );
}
