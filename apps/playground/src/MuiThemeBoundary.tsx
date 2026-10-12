import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import type { ResolvedTheme } from './theme.js'

export function MuiThemeBoundary({
  theme,
  children,
}: {
  theme: ResolvedTheme
  children: ReactNode
}) {
  const muiTheme = useMemo(() => createTheme({ palette: { mode: theme } }), [theme])
  return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
}
