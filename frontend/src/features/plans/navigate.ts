/**
 * Sends the browser to the payment provider's page. Its own module so the tests can replace it (jsdom can't navigate); the card is
 * entered on that page, never in PediTrack.
 */
export function goToCheckout(url: string): void {
  window.location.assign(url)
}
