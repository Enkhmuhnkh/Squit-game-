// Тоглолтын үр дүнгийн PNG карт зурна (Canvas API, гадаад сан хэрэггүй).

const W = 1080;
const H = 1080;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {{ gameName: string, nickname: string, headline: string, subline?: string, stat?: string, won: boolean }} info
 * @returns {Promise<Blob>}
 */
export function renderShareCard(info) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Арын дэвсгэр
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1630');
  bg.addColorStop(1, '#000000');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Чимэглэл: том дугуй/гурвалжин contour (Squid Game хэв маяг)
  ctx.strokeStyle = 'rgba(251,191,36,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, 230, 150, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';

  ctx.fillStyle = info.won ? '#fbbf24' : '#f87171';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(info.gameName, W / 2, 130);

  ctx.font = '800 72px system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(info.won ? '🏆' : '💀', W / 2, 300);

  ctx.font = '700 56px system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  wrapText(ctx, info.headline, W / 2, 420, 920, 64);

  if (info.subline) {
    ctx.font = '400 34px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(info.subline, W / 2, 500);
  }

  if (info.stat) {
    roundRect(ctx, W / 2 - 220, 560, 440, 110, 20);
    ctx.fillStyle = 'rgba(16,185,129,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,185,129,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '700 44px ui-monospace, monospace';
    ctx.fillStyle = '#34d399';
    ctx.fillText(info.stat, W / 2, 630);
  }

  ctx.font = '600 38px system-ui, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(info.nickname, W / 2, 820);

  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Party Game Hub', W / 2, 980);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

/** Карт зурж, татаж авах эсвэл (mobile) native share нээнэ. */
export async function shareResultCard(info) {
  const blob = await renderShareCard(info);
  const file = new File([blob], 'party-game-hub.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Party Game Hub' });
      return;
    } catch {
      // хэрэглэгч цуцалсан эсвэл share дэмжихгүй — доошоо унана
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'party-game-hub.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
