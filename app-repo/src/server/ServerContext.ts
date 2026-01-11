import { IncomingMessage } from "http";

export interface RequestContext {
  requestId: string;
  remoteAddress: string;
  auth?: {
    userId?: string;
    roles?: string[];
  };
  req: IncomingMessage;
}
