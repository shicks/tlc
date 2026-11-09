#!/usr/bin/env node
import { spawn } from 'node:child_process';

const py = process.platform === 'win32' ? 'python' : 'python3';
const proc = spawn(py, ['scripts/extract_attendance.py', ...process.argv.slice(2)], {
  stdio: 'inherit'
});
proc.on('exit', (code) => process.exit(code ?? 0));
