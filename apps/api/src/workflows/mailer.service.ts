import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config';

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Invio delle email tramite il server SMTP configurato (SMTP_URL, MAIL_FROM). */
@Injectable()
export class MailerService {
  private transport?: Transporter;
  /** messaggi "inviati" con SMTP_URL=json (test e prove senza server di posta) */
  readonly sentForTest: { to: string; subject: string; text: string }[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get configured() {
    return !!this.config.smtpUrl;
  }

  async send(to: string, subject: string, text: string) {
    if (!this.configured) {
      throw new BadRequestException(
        "Invio email non configurato: l'amministratore deve impostare SMTP_URL e MAIL_FROM",
      );
    }
    if (!EMAIL_RE.test(to)) throw new BadRequestException('Indirizzo email non valido');
    // niente a capo nell'oggetto: eviterebbe intestazioni aggiunte di nascosto
    const cleanSubject = subject.replace(/[\r\n]+/g, ' ').trim();
    if (this.config.smtpUrl === 'json') {
      this.sentForTest.push({ to, subject: cleanSubject, text });
      return;
    }
    this.transport ??= nodemailer.createTransport(this.config.smtpUrl);
    await this.transport.sendMail({
      from: this.config.mailFrom || undefined,
      to,
      subject: cleanSubject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}
