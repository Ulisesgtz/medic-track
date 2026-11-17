import { Component, useContext, type ReactNode } from 'react'
import { UNSAFE_LocationContext } from 'react-router-dom'
import { reportClientError } from '../clientErrors'
import { ErrorScreen } from './ErrorScreen'
import { forgetReload } from './reloadMemory'

// specs/072: a screen that breaks while it draws shows the error screen instead of a blank page, and the error is reported (cleaned).
// It starts again when the address changes, so leaving the broken screen is enough.

interface InnerProps {
  frame: 'shell' | 'page'
  pathname: string
  children: ReactNode
}

class Inner extends Component<InnerProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidMount() {
    // The frames drew (or showed their error screen, which already read the stamp): the page load after «Volver a cargar» is over.
    forgetReload()
  }

  componentDidCatch(error: unknown) {
    reportClientError('render', error)
  }

  componentDidUpdate(previous: InnerProps) {
    if (this.state.failed && previous.pathname !== this.props.pathname)
      this.setState({ failed: false })
  }

  render() {
    if (this.state.failed)
      return <ErrorScreen frame={this.props.frame} pathname={this.props.pathname} />
    return this.props.children
  }
}

export function RenderErrorBoundary({
  frame,
  children,
}: {
  frame: 'shell' | 'page'
  children: ReactNode
}) {
  // Outside a router (a test of a single piece) the address of the page is the one to use.
  const pathname = useContext(UNSAFE_LocationContext)?.location.pathname ?? window.location.pathname
  return (
    <Inner frame={frame} pathname={pathname}>
      {children}
    </Inner>
  )
}
