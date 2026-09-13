import type { ReactNode } from 'react';

/**
 * 把工坊描述渲染成界面内容。
 *
 * 描述来自第三方 mod 作者，内容不可信 —— 所以这里**只产出 React 节点，绝不注入原始 HTML**：
 * 先把 HTML 标签和 BBCode 都解析成结构化数据，再用组件渲染。链接也只用 onClick 交给主进程打开，
 * 不放进 <a href>，避免界面被导航走。
 *
 * 支持的标记（Steam 工坊常见写法）：
 *   [h1][h2][h3]  [b] [i] [u]  [url]…[/url]  [url=…]…[/url]
 *   [list][*]…[/list]  [hr]  [quote]…[/quote]  [img]…[/img]（只显示占位，不加载图片）
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export type Block =
  | { t: 'h'; level: number; spans: Inline[] }
  | { t: 'p'; spans: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'hr' }
  | { t: 'quote'; spans: Inline[] };

const URL_RE = /https?:\/\/[^\s<>()[\]"'，。；！？]+/i;

function stripTags(s: string): string {
  return s.replace(/\[[^\]]*\]/g, '');
}

function pushText(out: Inline[], raw: string, style: Omit<Inline, 'text'> = {}) {
  const text = stripTags(raw);
  if (!text) return;
  const merged = out[out.length - 1];
  const sameStyle =
    merged &&
    !merged.href &&
    !style.href &&
    !!merged.bold === !!style.bold &&
    !!merged.italic === !!style.italic;
  if (sameStyle) {
    merged.text += text;
    return;
  }
  out.push({ text, ...style });
}

/** 把纯文本里裸露的网址拆成可点链接 */
function splitBareUrls(out: Inline[], text: string, style: Omit<Inline, 'text'>) {
  let rest = text;
  while (rest) {
    const m = URL_RE.exec(rest);
    if (!m) {
      pushText(out, rest, style);
      break;
    }
    if (m.index > 0) pushText(out, rest.slice(0, m.index), style);
    const url = m[0];
    const prev = out[out.length - 1];
    const sameLink = prev && prev.href === url && !prev.bold === !style.bold;
    if (sameLink) prev.text += url;
    else out.push({ text: url, href: url, ...style });
    rest = rest.slice(m.index + url.length);
  }
}

function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re =
    /\[(b|i|u)\]([\s\S]*?)\[\/\1\]|\[url=([^\]]+)\]([\s\S]*?)\[\/url\]|\[url\]([\s\S]*?)\[\/url\]|\[img\]([\s\S]*?)\[\/img\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    if (m.index > last) splitBareUrls(out, stripTags(src.slice(last, m.index)), {});
    const tag = (m[1] || '').toLowerCase();
    if (tag === 'b') pushText(out, m[2], { bold: true });
    else if (tag === 'i' || tag === 'u') pushText(out, m[2], { italic: true });
    else if (m[3] !== undefined) pushText(out, m[4] || m[3], { href: m[3] });
    else if (m[5] !== undefined) pushText(out, m[5], { href: m[5] });
    else out.push({ text: '［图片］' });
    last = re.lastIndex;
  }
  if (last < src.length) splitBareUrls(out, stripTags(src.slice(last)), {});
  return out.filter((s) => s.text.length > 0);
}

/** 去掉首尾空白。`[list]` 后面通常紧跟一个换行，会切出一个空条目，这里一并清掉 */
function trimSpans(spans: Inline[]): Inline[] {
  const out = spans.map((s) => ({ ...s }));
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  }
  return out.filter((s) => s.text.length > 0);
}

function normalize(src: string): string {  return String(src || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li>/gi, '\n[*] ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n');
}

export function parseWorkshopText(src: string): Block[] {
  const text = normalize(src);
  const blocks: Block[] = [];

  const parts = text.split(
    /(\[list[^\]]*\][\s\S]*?\[\/list\]|\[quote\][\s\S]*?\[\/quote\]|\[h[1-6]\][\s\S]*?\[\/h[1-6]\]|\[hr\]\s*\[\/hr\]|\[hr\])/gi
  );

  for (const part of parts) {
    if (!part) continue;
    let m: RegExpExecArray | null;

    if ((m = /^\[h([1-6])\]([\s\S]*?)\[\/h[1-6]\]$/i.exec(part))) {
      blocks.push({ t: 'h', level: Number(m[1]), spans: parseInline(m[2]) });
      continue;
    }
    if (/^\[hr\]/i.test(part)) {
      blocks.push({ t: 'hr' });
      continue;
    }
    if ((m = /^\[list[^\]]*\]([\s\S]*?)\[\/list\]$/i.exec(part))) {
      const items = m[1]
        .split(/\[\*\]/)
        .map((s) => trimSpans(parseInline(s)))
        .filter((spans) => spans.length > 0);
      if (items.length) blocks.push({ t: 'ul', items });
      continue;
    }
    if ((m = /^\[quote\]([\s\S]*?)\[\/quote\]$/i.exec(part))) {
      blocks.push({ t: 'quote', spans: parseInline(m[1]) });
      continue;
    }

    for (const para of part.split(/\n{2,}/)) {
      const trimmed = para.replace(/^\n+|\n+$/g, '');
      if (!trimmed.trim()) continue;
      const spans = parseInline(trimmed);
      if (spans.length) blocks.push({ t: 'p', spans });
    }
  }

  return blocks;
}

function renderSpans(spans: Inline[], onClickLink: (url: string) => void): ReactNode {
  return spans.map((s, i) => {
    if (s.href) {
      return (
        <span
          key={i}
          className="ws-link"
          title={s.href}
          role="link"
          onClick={() => onClickLink(s.href!)}
        >
          {s.text}
        </span>
      );
    }
    let node: ReactNode = s.text;
    if (s.italic) node = <i>{node}</i>;
    if (s.bold) node = <b>{node}</b>;
    return <span key={i}>{node}</span>;
  });
}

export function WorkshopText({
  text,
  onOpenLink
}: {
  text: string;
  onOpenLink: (url: string) => void;
}) {
  const blocks = parseWorkshopText(text);
  if (!blocks.length) return null;

  return (
    <div className="ws-body">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return (
              <div key={i} className={`ws-h ws-h${Math.min(b.level, 3)}`}>
                {renderSpans(b.spans, onOpenLink)}
              </div>
            );
          case 'ul':
            return (
              <ul key={i} className="ws-ul">
                {b.items.map((item, j) => (
                  <li key={j}>{renderSpans(item, onOpenLink)}</li>
                ))}
              </ul>
            );
          case 'hr':
            return <hr key={i} className="ws-hr" />;
          case 'quote':
            return (
              <blockquote key={i} className="ws-quote">
                {renderSpans(b.spans, onOpenLink)}
              </blockquote>
            );
          default:
            return (
              <p key={i} className="ws-p">
                {renderSpans(b.spans, onOpenLink)}
              </p>
            );
        }
      })}
    </div>
  );
}
