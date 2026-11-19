/** Fixed-origin vendor transport. Never accepts arbitrary notification endpoints. */
export class ExpoPushProvider {
  constructor(private request: typeof fetch = fetch, private accessToken?: string) {}
  post(path: 'send' | 'getReceipts', body: unknown) {
    return this.request(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
  }
}
