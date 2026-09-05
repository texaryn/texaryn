import type { TexarynExample } from '@texaryn/examples'
import { groupByCategory, searchExamples } from './example-search.js'

export function ExampleBrowser({
  query,
  onQueryChange,
  selectedId,
  onSelect,
}: {
  query: string
  onQueryChange: (value: string) => void
  selectedId: string | null
  onSelect: (example: TexarynExample) => void
}) {
  const groups = groupByCategory(searchExamples(query))
  const total = groups.reduce((sum, group) => sum + group.examples.length, 0)

  return (
    <div className="pg-examples">
      <label className="pg-label" htmlFor="example-search">
        Search examples
      </label>
      <input
        id="example-search"
        className="pg-search"
        type="search"
        value={query}
        placeholder="oneOf, aria, array"
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {total === 0 ? (
        <p className="pg-empty">No example matches “{query}”.</p>
      ) : (
        <nav aria-label="Examples" className="pg-examples__nav">
          {groups.map((group) => (
            <section key={group.category}>
              <h3 className="pg-examples__category">{group.label}</h3>
              <ul className="pg-examples__list">
                {group.examples.map((example) => (
                  <li key={example.id}>
                    <button
                      type="button"
                      className="pg-examples__item"
                      onClick={() => onSelect(example)}
                      aria-current={example.id === selectedId ? 'true' : undefined}
                      title={example.description}
                    >
                      {example.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </div>
  )
}
