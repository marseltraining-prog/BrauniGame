// node sim/sweep.js <level> <seeds> <years> '<json1>' '<json2>' ... — параллельный прогон вариантов конфига (BK_CFG), по строке сводки на вариант
const { spawn } = require('child_process');
const [level, seeds, years, ...vars] = process.argv.slice(2);
const out = {};
let left = vars.length;
for (const v of vars) {
  const p = spawn(process.execPath, [__dirname + '/bot.js', level, seeds, years, '--summary', '--stop'], { env: Object.assign({}, process.env, { BK_CFG: v }) });
  let buf = '';
  p.stdout.on('data', (d) => (buf += d));
  p.on('close', () => {
    const rows = buf.split('\n').filter((l) => /^│ \d/.test(l)).map((l) => l.split('│').map((x) => x.trim()));
    const hdr = buf.split('\n').find((l) => l.includes('(index)')).split('│').map((x) => x.trim());
    const col = (k) => rows.map((r) => r[hdr.indexOf(k)]);
    out[v] = { won: col('won').join(' '), wSt: col('wSt').join(' '), lost: col('lost').join(' '), y1p: col('y1p').join(' '), minLiq: col('minLiq').join(' '), s10: col('s10').join(' '), tail: buf.split('\n').filter((l) => l.startsWith('wins')).join('') };
    if (--left === 0) for (const k of vars) console.log(k, '\n ', JSON.stringify(out[k]));
  });
}
