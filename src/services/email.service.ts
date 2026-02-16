import nodemailer from 'nodemailer';
import { env, TIMEOUTS } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleApiError } from '../utils/error-handler.js';

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: env.GOOGLE_USER_EMAIL,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
    },
  } as nodemailer.TransportOptions);
}

export async function sendMeetingInvite(
  to: string,
  subject: string,
  meetLink: string,
  dateTime: string,
): Promise<void> {
  try {
    const transport = createTransport();

    const html = `
      <h2>${subject}</h2>
      <p><strong>Data/Hora:</strong> ${dateTime}</p>
      <p><strong>Link da reuniao:</strong> <a href="${meetLink}">${meetLink}</a></p>
      <br>
      <p>Voce foi convidado para esta reuniao. Clique no link acima para participar.</p>
    `.trim();

    await transport.sendMail({
      from: env.GOOGLE_USER_EMAIL,
      to,
      subject: `Convite: ${subject}`,
      html,
    });

    logger.info(
      { service: 'email', action: 'send-invite', to, subject },
      `Meeting invite sent to ${to}`,
    );
  } catch (error) {
    logger.error({ service: 'email', action: 'send-invite', error, to }, 'Failed to send meeting invite');
    throw handleApiError(error, 'email');
  }
}
