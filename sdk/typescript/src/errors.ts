/**
 * Thrown when the client is constructed with an invalid or inconsistent
 * configuration — most importantly, an environment/key-prefix mismatch
 * (e.g. `environment: 'live'` with a `bz_test_…` sandbox key). Surfaces
 * configuration mistakes at construction time, before any money can move.
 */
export class BanzamiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BanzamiConfigError';
  }
}

export class BanzamiApiError extends Error {
  readonly status:  number;
  readonly code:    string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name   = 'BanzamiApiError';
    this.status = status;
    this.code   = code;
  }

  get isNotFound():          boolean { return this.status === 404; }
  get isUnauthorized():      boolean { return this.status === 401; }
  get isForbidden():         boolean { return this.status === 403; }
  get isConflict():          boolean { return this.status === 409; }
  get isInsufficientFunds(): boolean { return this.code === 'INSUFFICIENT_FUNDS'; }
  get isHandleNotFound():    boolean { return this.code === 'HANDLE_NOT_FOUND'; }
  get isHandleTaken():       boolean { return this.code === 'HANDLE_TAKEN'; }
  get isWalletNotFound():    boolean { return this.code === 'WALLET_NOT_FOUND'; }
  get isWalletNotActive():   boolean { return this.code === 'WALLET_NOT_ACTIVE'; }
}
