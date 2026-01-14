#!/usr/bin/env node
import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';
import App from './app.js';

const program = new Command();
program
  .name('database-dumper-cli')
  .description('Interactive Ink-based database dump CLI (MySQL)')
  .option('--config <path>', 'Custom config path')
  .option('--select <idOrAlias>', 'Preselect database by id or alias')
  .action((opts) => {
    render(<App configPath={opts.config} selectId={opts.select} />);
  });

program.parse(process.argv);
