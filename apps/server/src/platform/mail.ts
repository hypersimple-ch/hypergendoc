export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}
export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}
export function createMailAdapter(
  send: (message: MailMessage) => Promise<void>,
): MailAdapter {
  return { send };
}
