// Wrapper around IndexedDB.

// In theory, I could have a table registry where we track all the
// initializations.  We could take a list of "upgrades" including
// the expected version number at each and what to do to update, and
// it's an error if we're missing one - this would still essentially
// require all downstream includes to be present: it's organizationally
// distributed, but not truly distributed in the sense of everything
// being loosely required.  But it's also a much bigger pain.

const DB_NAME = '__sdh__tlcHelper';

type IDbUpgrade = [
  oldVersion: number,
  upgrade?: (db: IDBDatabase) => Promise<void>,
];

export class IDb<T> {
  constructor(
    private readonly storeName: string,
    private readonly upgrades: IDbUpgrade[],
  ) {
    // TODO - register
    [] = [this.storeName, this.upgrades, DB_NAME];
  }

  get(): T {
    throw new Error();
  }
}

// On actual use - report an error for a missing oldVersion.
