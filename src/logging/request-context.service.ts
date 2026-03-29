import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContextStore = {
  requestId: string;
  sessionId?: string;
  userId?: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(context: RequestContextStore, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getContext(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  assign(context: Partial<RequestContextStore>): void {
    const store = this.storage.getStore();

    if (!store) {
      return;
    }

    Object.assign(store, context);
  }
}
