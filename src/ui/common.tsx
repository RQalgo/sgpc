import { useEffect, useMemo, useRef } from 'react';
import { decodeBuild, replaceBuild, resolve, type Build, type Resolved } from '../engine/build.ts';
import { checkItems, type Issue, type Severity } from '../engine/compat.ts';
import type { Db } from '../engine/db.ts';
import { buildTotal } from '../engine/shopping.ts';
import { money } from '../format.ts';
import { navigate, type Route } from '../router.ts';
import type { Category } from '../types.ts';

export interface BuildState {
  build: Build;
  items: Resolved[];
  missing: { category: Category; id: string }[];
  issues: Issue[];
  total: number;
  estimated: boolean;
  set: (b: Build) => void;
}

/** The build held in the address bar. Every change rewrites the URL, so the link is always current. */
export function useBuild(db: Db, route: Route): BuildState {
  return useMemo(() => {
    const build = decodeBuild(route.query);
    const { items, missing } = resolve(build, db);
    const { total, estimated } = buildTotal(items, db);
    return {
      build,
      items,
      missing,
      issues: checkItems(items, db),
      total,
      estimated,
      set: (b: Build) => navigate(route.path, replaceBuild(route.query, b), true),
    };
  }, [db, route.path, route.query]);
}

const SEVERITY_LABEL: Record<Severity, string> = { error: 'Will not work', warning: 'Check this', todo: 'Still needed', unverified: 'Not verified', info: 'Good to know' };

export function Issues({ issues, compact = false }: { issues: Issue[]; compact?: boolean }) {
  if (!issues.length) return <p className="ok-line">No compatibility problems found.</p>;
  return (
    <ul className={`issues${compact ? ' compact' : ''}`}>
      {issues.map((i) => (
        <li key={i.code + i.title} className={`issue ${i.severity}`}>
          <span className="issue-kind">{SEVERITY_LABEL[i.severity]}</span>
          <strong>{i.title}</strong>
          {!compact && <span className="issue-detail">{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function issueSummary(issues: Issue[]): { text: string; tone: 'bad' | 'warn' | 'ok' } {
  const n = (s: Severity) => issues.filter((i) => i.severity === s).length;
  if (n('error')) return { text: `${n('error')} part${n('error') > 1 ? 's' : ''} will not work together`, tone: 'bad' };
  if (n('warning')) return { text: `${n('warning')} thing${n('warning') > 1 ? 's' : ''} to check`, tone: 'warn' };
  if (n('todo')) return { text: `${n('todo')} part${n('todo') > 1 ? 's' : ''} still needed`, tone: 'warn' };
  return { text: 'Parts work together', tone: 'ok' };
}

export function Price({ value, estimated = false, highlight = false }: { value: number | null; estimated?: boolean; highlight?: boolean }) {
  if (value === null) return <span className="price none">no price</span>;
  return (
    <span className={`price${highlight ? ' hl' : ''}`} title={estimated ? 'Worked out from bundle prices; no shop lists this part on its own' : undefined}>
      {estimated ? '≈ ' : ''}
      {money(value)}
    </span>
  );
}

export function ShopTag({ db, id }: { db: Db; id: string }) {
  const shop = db.shopById.get(id);
  return (
    <span className="shop-tag">
      {shop?.name ?? id}
      {shop && /^#/.test(shop.unit) && <span className="unit">{shop.unit}</span>}
    </span>
  );
}

/** Native <dialog>, opened modally while mounted. */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="btn quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export function CopyLink({ label = 'Copy link' }: { label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className="btn"
      onClick={async () => {
        const url = location.href;
        try {
          await navigator.clipboard.writeText(url);
          if (ref.current) {
            ref.current.textContent = 'Link copied';
            setTimeout(() => ref.current && (ref.current.textContent = label), 1800);
          }
        } catch {
          window.prompt('Copy this link', url);
        }
      }}
    >
      {label}
    </button>
  );
}

// ---- Recent builds, kept in this browser only

export interface Recent {
  query: string;
  name: string;
  total: number;
  parts: number;
  at: number;
}

const KEY = 'sgpc.recent';

export function readRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Recent[]) : [];
  } catch {
    return [];
  }
}

export function rememberBuild(query: string, name: string, total: number, parts: number) {
  try {
    const list = readRecent().filter((r) => r.name !== name || !name);
    const next = [{ query, name, total, parts, at: Date.now() }, ...list.filter((r) => r.query !== query)].slice(0, 6);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recent builds are a convenience only */
  }
}
