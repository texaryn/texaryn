import type { CSSProperties } from 'react'
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
    <div style={styles.browser}>
      <label style={styles.label} htmlFor="example-search">
        Search examples
      </label>
      <input
        id="example-search"
        type="search"
        value={query}
        placeholder="oneOf, aria, array"
        onChange={(event) => onQueryChange(event.target.value)}
        style={styles.search}
      />

      {total === 0 ? (
        <p style={styles.empty}>No example matches “{query}”.</p>
      ) : (
        <nav aria-label="Examples" style={styles.nav}>
          {groups.map((group) => (
            <section key={group.category}>
              <h3 style={styles.category}>{group.label}</h3>
              <ul style={styles.list}>
                {group.examples.map((example) => {
                  const selected = example.id === selectedId
                  return (
                    <li key={example.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(example)}
                        aria-current={selected ? 'true' : undefined}
                        title={example.description}
                        style={{
                          ...styles.item,
                          ...(selected ? styles.itemSelected : null),
                        }}
                      >
                        {example.title}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  browser: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
  },
  search: {
    padding: '0.4rem',
    fontSize: '0.9rem',
    marginBottom: '0.75rem',
  },
  nav: {
    overflow: 'auto',
    minHeight: 0,
  },
  category: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#666',
    margin: '0.75rem 0 0.25rem 0',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.3rem 0.4rem',
    fontSize: '0.85rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    background: 'none',
    cursor: 'pointer',
    borderRadius: '3px',
  },
  itemSelected: {
    background: '#e8f0fe',
    borderColor: '#a8c7fa',
    fontWeight: 600,
  },
  empty: {
    fontSize: '0.85rem',
    color: '#666',
  },
}
