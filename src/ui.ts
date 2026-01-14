import ora from 'ora';
import chalk from 'chalk';

export function startSpinner(text: string) {
  return ora({ text, spinner: 'dots' }).start();
}

export function step(title: string) {
  console.log('\n' + chalk.bold(`› ${title}`));
}
