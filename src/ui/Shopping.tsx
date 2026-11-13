import { useState } from 'react';
import type { Resolved } from '../engine/build.ts';
import type { Db } from '../engine/db.ts';
import { shoppingPlans, type Plan } from '../engine/shopping.ts';
import { listDate, money } from '../format.ts';
import { CATEGORY_LABEL } from '../types.ts';

function planText(db: Db, plan: Plan, name: string, extra: number): string {
  const out: string[] = [name ? `${name} — shopping list` : 'PC shopping list', ''];
  for (const id of plan.shops) {
    const shop = db.shopById.get(id);
    const lines = plan.lines.filter((l) => l.shop === id);
    out.push(`${shop?.name} (${shop?.unit}, Sim Lim Square) — ${money(lines.reduce((s, l) => s + l.total, 0))}`);
    for (const l of lines) out.push(`  ${l.qty > 1 ? `${l.qty} x ` : ''}${l.kind === 'bundle' && l.total === 0 ? `${l.product.name} (in bundle)` : l.kind === 'bundle' ? l.label : l.product.name}${l.total ? ` — ${money(l.total)}` : ''}`);
    out.push('');
  }
  out.push(`Total: ${money(plan.total + extra)}${extra ? ` (includes about ${money(extra)} for parts without a listed price)` : ''}`, location.href);
  return out.join('\n');
}

export function Shopping({ db, items, name }: { db: Db; items: Resolved[]; name: string }) {
  const { plans, unpriced } = shoppingPlans(items, db);
  const [choice, setChoice] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  if (!items.length) return <p className="empty">Add parts to see where to buy them.</p>;
  const index = choice !== null && choice < plans.length ? choice : plans.length - 1;
  const plan = plans[index];
  const extra = unpriced.reduce((s, u) => s + (u.estimate ?? 0) * u.qty, 0);
  const cheapest = plans.at(-1);

  return (
    <div className="shopping">
      {plans.length > 1 && (
        <fieldset className="plan-choice">
          <legend>How many shops are you willing to visit?</legend>
          {plans.map((p, i) => (
            <label key={p.shops.join()} className={i === index ? 'plan-option on' : 'plan-option'}>
              <input type="radio" name="plan" checked={i === index} onChange={() => setChoice(i)} />
              <span className="plan-title">{p.shops.length === 1 ? 'One shop' : `${p.shops.length} shops`}</span>
              <span className="plan-shops">{p.shops.map((s) => db.shopById.get(s)?.name).join(', ')}</span>
              <span className="plan-total">{money(p.total)}</span>
              <span className="plan-delta">{cheapest && p.total > cheapest.total ? `${money(p.total - cheapest.total)} more than the cheapest` : 'cheapest'}</span>
            </label>
          ))}
        </fieldset>
      )}

      {plan ? (
        <div className="slips">
          {plan.shops.map((id) => {
            const shop = db.shopById.get(id);
            const lines = plan.lines.filter((l) => l.shop === id);
            return (
              <section className="slip" key={id}>
                <header>
                  <h2>{shop?.name}</h2>
                  <p>{shop?.unit}{/^#/.test(shop?.unit ?? '') ? ', Sim Lim Square' : ''}</p>
                  <p className="slip-meta">
                    Prices from the list dated {listDate(shop?.listDate ?? null)}. <a href={shop?.sourceUrl} target="_blank" rel="noreferrer">Open the list</a>
                  </p>
                </header>
                <table>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.category + l.product.id} className={l.kind === 'bundle' ? 'bundle' : ''}>
                        <td className="slip-cat">{CATEGORY_LABEL[l.category]}</td>
                        <td>
                          {l.qty > 1 && <span className="qty">{l.qty} × </span>}
                          {l.product.name}
                          {l.kind === 'bundle' && l.total > 0 && <span className="tag">bundle with motherboard</span>}
                          {l.kind === 'bundle' && l.total === 0 && <span className="tag">in the bundle</span>}
                          {l.kind === 'offer' && <span className="printed-as">Listed as: {l.label}</span>}
                          {l.note && <span className="printed-as">{l.note}</span>}
                        </td>
                        <td className="num">{l.total ? money(l.total) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td></td><td>Subtotal at {shop?.name}</td><td className="num">{money(lines.reduce((s, l) => s + l.total, 0))}</td></tr>
                  </tfoot>
                </table>
                {shop?.notes.map((n) => <p className="slip-note" key={n}>{n}</p>)}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="empty">No combination of shops lists every priced part. See the parts below.</p>
      )}

      {unpriced.length > 0 && (
        <section className="slip ask">
          <header>
            <h2>Ask at the counter</h2>
            <p>No standalone price on this week's lists.</p>
          </header>
          <table>
            <tbody>
              {unpriced.map((u) => (
                <tr key={u.product.id}>
                  <td className="slip-cat">{CATEGORY_LABEL[u.category]}</td>
                  <td>
                    {u.qty > 1 && <span className="qty">{u.qty} × </span>}
                    {u.product.name}
                    <span className="printed-as">{u.reason}</span>
                  </td>
                  <td className="num">{u.estimate !== null ? `≈ ${money(u.estimate * u.qty)}` : '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {plan && (
        <div className="grand">
          <div>
            <span className="grand-label">Total{extra ? ' (with estimates)' : ''}</span>
            <span className="grand-total">{money(plan.total + extra)}</span>
          </div>
          <div className="grand-actions">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const text = planText(db, plan, name, extra);
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  window.prompt('Copy this list', text);
                }
              }}
            >
              {copied ? 'List copied' : 'Copy list as text'}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      )}
      {plan?.notes.map((n) => <p className="note" key={n}>{n}</p>)}
      <p className="note">Prices are from the shops' published lists and can change or sell out. The shop's price at the counter is final.</p>
    </div>
  );
}
