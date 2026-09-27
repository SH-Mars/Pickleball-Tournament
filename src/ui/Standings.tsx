import type { GroupView } from './matchView';

export function StandingsTable({ view, advance }: { view: GroupView; advance: number }) {
  return (
    <section className="standings card" aria-labelledby={`st-${view.id}`}>
      <div className="card-head">
        <h2 id={`st-${view.id}`}>{view.name}</h2>
        <span className={`pill${view.complete ? ' st-complete' : ''}`}>{view.complete ? 'Final standings' : 'In progress'}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th scope="col" className="num">#</th><th scope="col">Team</th><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num">PF</th><th scope="col" className="num">PA</th><th scope="col" className="num">+/−</th></tr>
          </thead>
          <tbody>
            {view.rows.map(({ row, names }) => (
              <tr key={row.teamId} className={advance > 0 && row.rank <= advance ? 'advances' : undefined}>
                <td className="num">{row.rank}</td>
                <td className="team-cell">{names.map((n, i) => <span key={i}>{n}</span>)}</td>
                <td className="num strong">{row.wins}</td>
                <td className="num">{row.losses}</td>
                <td className="num">{row.pointsFor}</td>
                <td className="num">{row.pointsAgainst}</td>
                <td className="num">{row.diff > 0 ? '+' : ''}{row.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {advance > 0 && <p className="hint">Shaded teams advance to the playoffs once the pool is finished. Ties: wins, then head-to-head, then point difference.</p>}
      {advance === 0 && <p className="hint">Ties: wins, then head-to-head, then point difference, then points scored.</p>}
    </section>
  );
}
