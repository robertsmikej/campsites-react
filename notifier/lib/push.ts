// The Web Push sender is shared with the Next app (the in-app "send test push"
// route uses the same code path as the notifier's alerts). Single source of truth.
export { sendWebPush, type WebPushVapid, type SendResult } from "../../next/src/lib/push/send";
