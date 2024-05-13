import { spawn } from 'child_process';
import path from 'node:path';
const __dirname = path.resolve();

export async function htmlToBase64PnClient(input) {
  const jsonData = JSON.stringify(input)
  const b64Data = Buffer.from(jsonData).toString('base64');
  let stdoutData = '';

  return await new Promise((resolve) => {
    const proc = spawn('node', [
      path.resolve(__dirname, 'htmlToBase64PngWorker.js'),
      `--input-data${b64Data}`,
      '--tagprocess'
    ], { shell: false });

    proc.stdout.on('data', (data) => {
      stdoutData += data;
    });

    proc.stderr.on('data', (data) => {
      console.error(`NodeERR: ${data}`);
    });

    proc.on('exit', function () {
      proc.kill();
      resolve(JSON.parse(stdoutData));
    });
  });
}