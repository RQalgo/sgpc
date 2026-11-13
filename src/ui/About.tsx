import type { Db } from '../engine/db.ts';
import { listDate } from '../format.ts';

export function About({ db }: { db: Db }) {
  return (
    <div className="page narrow prose">
      <h1>About the data</h1>

      <h2>Where prices come from</h2>
      <p>
        Sim Lim Square shops publish PDF price lists, which{' '}
        <a href="https://www.hardwarezone.com.sg/pc/sim-lim-square-weekly-price-list-downloads" target="_blank" rel="noreferrer">HardwareZone collects each week</a>. SGPC downloads the current
        lists, reads every line, and matches the same product across shops. This site was built from lists dated{' '}
        {db.shops.map((s) => `${s.name} ${listDate(s.listDate)}`).join('; ')}.
      </p>
      <p>SGPC is not affiliated with HardwareZone or any shop. The shop's price at the counter is final, and stock changes daily.</p>

      <h2>What can go wrong</h2>
      <ul>
        <li>
          <strong>Misread lines.</strong> The lists are dense and each shop lays its out differently. Each price shows the line as printed and links to the original list, so you can check it.
        </li>
        <li>
          <strong>Scanned lists.</strong> PC Themes, Prime PC and TradePac publish their lists as images, which are read by OCR. PC Themes' prices are used as read. For Prime PC and TradePac a price
          is shown only when another shop's printed price for the same part is close to it, and their bundle tables are not read.
        </li>
        <li>
          <strong>CPU prices.</strong> Most shops print CPU + motherboard bundle prices, not CPU-only prices. Where a shop also prints the board's own price, the CPU's price is worked out as the
          difference and marked with ≈.
        </li>
        <li>
          <strong>Bundle conditions.</strong> Some shops price bundles for a full PC purchase or add a fee when the bundle is bought alone. The shopping list says so where it applies.
        </li>
      </ul>

      <h2>Compatibility checks</h2>
      <p>
        Sockets, memory type, board size, power draw and connectors are checked from each part's specifications. CPU and graphics chip specifications come from a reference table; motherboard,
        memory, storage and power supply details are read from the product name. Price lists do not give physical dimensions, so graphics card length, cooler height and radiator fit are reported
        as "not verified" for you to check.
      </p>

      <h2>Performance estimates</h2>
      <p>
        Frame rates are estimated by scaling a reference result (an RTX 5090 with a Ryzen 7 9800X3D) by how the chosen graphics chip and CPU compare, then taking whichever is the limit. The
        comparison figures and the reference frame rates are approximations compiled from published reviews, not measurements of your exact parts. Treat them as a guide to which build is faster,
        not a promise of a number.
      </p>

      <h2>Sharing</h2>
      <p>A build is stored entirely in its link. Nothing is saved on a server, there are no accounts, and a link keeps working as prices update. Parts that drop off the lists are flagged when the link is opened.</p>
    </div>
  );
}
