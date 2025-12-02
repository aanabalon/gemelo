declare module 'nodemailer' {
  export interface Transporter {
    sendMail: (mail: any) => Promise<any>;
  }

  export function createTransport(options: any): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
