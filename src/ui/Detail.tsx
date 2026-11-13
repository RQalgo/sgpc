import type { Db } from '../engine/db.ts';
import { listDate, money, specRows } from '../format.ts';
import { href } from '../router.ts';
import { CATEGORY_LABEL, type Product } from '../types.ts';
import { Dialog, ShopTag } from './common.tsx';

function bundlesFor(db: Db, p: Product): { other: Product; shop: string; price: number }[] {
  if (p.category !== 'cpu' && p.category !== 'motherboard') return [];
  const out: { other: Product; shop: string; price: number }[] = [];
  for (const [key, list] of db.bundles) {
    const [mb, cpu] = key.split('|');
    const otherId = p.category === 'cpu' ? (cpu === p.id ? mb : null) : mb === p.id ? cpu : null;
    const other = otherId ? db.byId.get(otherId) : undefined;
    if (other) out.push({ other, shop: list[0].shop, price: list[0].price });
  }
  return out.sort((a, b) => a.price - b.price);
}

export function Detail({ db, product, onAdd }: { db: Db; product: Product; onAdd?: (p: Product) => void }) {
  const printed = product.offers.filter((o) => !o.derived);
  const derived = product.offers.filter((o) => o.derived);
  const rows = specRows(product);
  const bundles = bundlesFor(db, product);
  const best = printed[0]?.price;
  const search = encodeURIComponent(product.name);
  const chip = product.specs.chip ? db.gpuRef.get(product.specs.chip) : undefined;

  return (
    <div className="detail">
      <p className="detail-kicker">{CATEGORY_LABEL[product.category]}</p>
      <h1 className="detail-name">{product.name}</h1>
      <div className="detail-actions">
        {onAdd && (
          <button type="button" className="btn primary" onClick={() => onAdd(product)}>
            Add to build
          </button>
        )}
        <a className="btn" href={`https://www.google.com/search?q=${search}`} target="_blank" rel="noreferrer">Search the web</a>
        <a className="btn" href={`https://www.google.com/search?tbm=isch&q=${search}`} target="_blank" rel="noreferrer">Find photos</a>
      </div>
      {product.image && (
        <figure className="detail-photo">
          <img src={product.image} alt={product.name} loading="lazy" />
          <figcaption>
            {product.category === 'gpu' && `A ${product.specs.chipName} card; this exact model may look different. `}
            Photo: {product.imageCredit}
            {product.url && <>, via <a href={product.url} target="_blank" rel="noreferrer">Wikimedia Commons</a></>}
          </figcaption>
        </figure>
      )}

      <h2>Prices this week</h2>
      {printed.length === 0 ? (
        <p className="empty">
          {derived.length || bundles.length ? 'No shop lists this part on its own; it is sold as part of a CPU + motherboard bundle (below).' : 'No shop lists a price for this part this week.'}
        </p>
      ) : (
        <table className="table prices">
          <thead>
            <tr><th>Shop</th><th className="num">Price</th><th>As printed on the list</th><th>List dated</th></tr>
          </thead>
          <tbody>
            {printed.map((o) => {
              const shop = db.shopById.get(o.shop);
              return (
                <tr key={o.shop}>
                  <td><ShopTag db={db} id={o.shop} /></td>
                  <td className="num"><span className={o.price === best ? 'price hl' : 'price'}>{money(o.price)}</span></td>
                  <td className="printed">
                    {o.label}
                    {shop && <> <a href={shop.sourceUrl} target="_blank" rel="noreferrer">page {o.page} of the list</a></>}
                  </td>
                  <td>{listDate(shop?.listDate ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {derived.length > 0 && (
        <p className="note">
          Worked out from bundle prices (bundle minus the board's own price):{' '}
          {derived.map((o, i) => (
            <span key={o.shop}>{i > 0 && ', '}about {money(o.price)} at {db.shopById.get(o.shop)?.name}</span>
          ))}
          . Shops may not sell it alone at this price.
        </p>
      )}

      {bundles.length > 0 && (
        <>
          <h2>CPU + motherboard bundles</h2>
          <table className="table">
            <thead>
              <tr><th>{product.category === 'cpu' ? 'With motherboard' : 'With CPU'}</th><th>Shop</th><th className="num">Bundle price</th></tr>
            </thead>
            <tbody>
              {bundles.slice(0, 14).map((b) => (
                <tr key={b.other.id}>
                  <td><a href={href(`/part/${b.other.id}`)}>{b.other.name}</a></td>
                  <td><ShopTag db={db} id={b.shop} /></td>
                  <td className="num price">{money(b.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bundles.length > 14 && <p className="note">{bundles.length - 14} more bundles include this part. Choose both parts in a build to see the price for a specific pair.</p>}
        </>
      )}

      <h2>Specifications</h2>
      {rows.length === 0 ? (
        <p className="empty">The price lists give only the name for this kind of part.</p>
      ) : (
        <table className="table specs-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                <td>
                  {r.value}
                  {r.assumed && <span className="assumed"> assumed from the name</span>}
                </td>
              </tr>
            ))}
            {chip && (
              <tr>
                <th>Relative speed</th>
                <td>{chip.perf1080}% / {chip.perf1440}% / {chip.perf4k}% of an RTX 5090 at 1080p / 1440p / 4K (estimate)</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {rows.some((r) => r.assumed) && <p className="note">"Assumed" values are read from the product name or typical for the class. Check the maker's spec sheet before relying on them.</p>}
    </div>
  );
}

export function DetailDialog({ db, product, onAdd, onClose }: { db: Db; product: Product; onAdd?: (p: Product) => void; onClose: () => void }) {
  return (
    <Dialog title="Part details" onClose={onClose} wide>
      <Detail db={db} product={product} onAdd={onAdd} />
    </Dialog>
  );
}

export function DetailPage({ db, id }: { db: Db; id: string }) {
  const product = db.byId.get(id);
  if (!product) {
    return (
      <div className="status">
        <h1>This part is not on this week's lists</h1>
        <p>It may have sold out or been renamed. <a href={href('/build')}>Browse current parts</a></p>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <Detail db={db} product={product} />
      <p className="note"><a href={href('/build', `${paramFor(product)}=${product.id}`)}>Start a build with this part</a></p>
    </div>
  );
}

const paramFor = (p: Product) =>
  ({ cpu: 'cpu', motherboard: 'mb', ram: 'ram', gpu: 'gpu', storage: 'ssd', psu: 'psu', case: 'case', cooler: 'cool', fan: 'fan', monitor: 'mon', os: 'os', keyboard: 'kb', mouse: 'mouse', headset: 'hs' })[p.category];
