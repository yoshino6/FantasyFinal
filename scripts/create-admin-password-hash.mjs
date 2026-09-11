import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const readPassword = async () => {
  if (!process.stdin.isTTY) throw new Error('请在交互式终端中运行此命令。');
  process.stdout.write('后台初始密码（至少 10 位）：');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === '\u0003') { process.stdout.write('\n'); reject(new Error('已取消生成。')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') { value = value.slice(0, -1); continue; }
        value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
};

try {
  const password = await readPassword();
  if (password.length < 10 || password.length > 200) throw new Error('密码长度必须为 10～200 位。');
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  console.log(`scrypt$${salt}$${derived.toString('hex')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '生成失败。');
  process.exitCode = 1;
}
