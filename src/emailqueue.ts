import * as ui from './ui';

export interface IMessage {
  id?: number;
  recipient: string;
  subject: string;
  message: string;
}

export class MessageStore {
  private dbName: string = "MessageDB";
  private storeName: string = "messages";
  private version: number = 1;
  private db: IDBDatabase | null = null;

  static async open(): Promise<MessageStore> {
    const store = new MessageStore();
    await store.initialize();
    return store;
  }

  private constructor() {}

  /** Initializes the database connection. */
  private async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject(`Database error: ${(event.target as IDBOpenDBRequest).error}`);
      };
    });
  }

  /** Inserts a new message record. */
  async insertMessage(recipient: string, subject: string, message: string): Promise<number> {
    const store = this.getStore("readwrite");
    const entry: IMessage = { recipient, subject, message };
    
    return new Promise((resolve, reject) => {
      const request = store.add(entry);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject("Failed to insert message");
    });
  }

  /** Retrieves all messages from the store. */
  async readAllMessages(): Promise<IMessage[]> {
    const store = this.getStore("readonly");
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as IMessage[]);
      request.onerror = () => reject("Failed to read messages");
    });
  }

  /** Deletes a specific message by its ID. */
  async deleteMessage(id: number): Promise<void> {
    const store = this.getStore("readwrite");
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(`Failed to delete message with ID: ${id}`);
    });
  }

  /** Deletes the entire database. */
  async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject("Failed to delete database");
      request.onblocked = () => console.warn("Delete blocked: close other tabs.");
    });
  }

  /** Private helper to access the object store. */
  private getStore(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error("Database not initialized. Call initDB() first.");
    }
    const transaction = this.db.transaction(this.storeName, mode);
    return transaction.objectStore(this.storeName);
  }
}

(window as any)._sdh_eq = MessageStore.open;

//////////////////////

// NOTE: message should be HTML
async function sendEmail(id: string, subject: string, message: string) {
  const elts = [...document.querySelectorAll('.btn.btn-success')]
                 .filter(e => e.textContent.includes('Send Email'));
  if (elts.length !== 1) throw new Error(`Couldn't find unique send button`);
  $('#emailusersform-view_users').val([id]).trigger('change');
  await new Promise(resolve => setTimeout(resolve, 100));
  $('#emailusersform-subject').val(subject).trigger('change');
  await new Promise(resolve => setTimeout(resolve, 100));
  $('#emailusersform-body').val(message).trigger('change');
  await new Promise(resolve => setTimeout(resolve, 1000));
  (elts[0] as HTMLButtonElement).click();
}

async function sendNextEmail() {
  const db = await MessageStore.open();
  const [msg] = await db.readAllMessages();
  if (!msg) return;
  if (msg.id != null) {
    db.deleteMessage(msg.id); // TODO - how to ensure this isn't premature?
  }
  sendEmail(msg.recipient, msg.subject, msg.message);
}

function installUi() {
  ui.addButtonsToTop({
    'SendNext': sendNextEmail,
  });
}

const URL_PREFIX = 'https://www.traillifeconnect.com/email/users';
if (window.location.href.startsWith(URL_PREFIX)) installUi();
