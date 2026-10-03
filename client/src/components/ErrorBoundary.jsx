import { Component } from 'react';

/** 3D (WebGL) алдаа гарвал бүх апп унахын оронд fallback харуулна. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[3D] алдаа:', error);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
