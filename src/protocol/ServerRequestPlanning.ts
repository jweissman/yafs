import Yafs from "../index";
import {
  CommandRequest,
  isCacheRequest,
  isOperationRequest,
  isWriteRequest,
  Request,
  WriteRequest,
} from "./Framing";

export function planRequest(session: Yafs, request: Request) {
  if (isCacheRequest(request)) {
    return session.planCache(request.cache);
  }
  if (isOperationRequest(request)) {
    return session.planOperationAsync(request.operation);
  }
  return planCommand(session, request);
}

function planCommand(session: Yafs, request: CommandRequest | WriteRequest) {
  return isWriteRequest(request)
    ? session.planWrite(request.write.path, request.write.content)
    : session.planAsync(request.command);
}
