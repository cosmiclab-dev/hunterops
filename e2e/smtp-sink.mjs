// Local SMTP server that accepts any login and writes each message to OUT_FILE.
import fs from 'node:fs';
import { SMTPServer } from 'smtp-server';

const OUT = process.env.SMTP_OUT || '/tmp/hunterops-mail.jsonl';
fs.writeFileSync(OUT, '');
new SMTPServer({
  secure: false,
  authOptional: false,
  allowInsecureAuth: true,
  onAuth(auth, _s, cb) { cb(null, { user: auth.username }); },
  onData(stream, session, cb) {
    let data = '';
    stream.on('data', (c) => { data += c; });
    stream.on('end', () => {
      fs.appendFileSync(OUT, `${JSON.stringify({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), data })}\n`);
      cb();
    });
  },
}).listen(Number(process.env.SMTP_PORT || 2525), () => console.log('SMTP sink on', process.env.SMTP_PORT || 2525));
