import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const EWS_URL = 'https://posta.tgs.aero/EWS/Exchange.asmx';
const DOMAIN = 'tgs';
const MESSAGES_NS = 'http://schemas.microsoft.com/exchange/services/2006/messages';
const TYPES_NS = 'http://schemas.microsoft.com/exchange/services/2006/types';
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

function configValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, '');
}

function soapEnvelope(body) {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    `<soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:m="${MESSAGES_NS}" xmlns:t="${TYPES_NS}">` +
    '<soap:Header><t:RequestServerVersion Version="Exchange2013" /></soap:Header>' +
    `<soap:Body>${body}</soap:Body></soap:Envelope>`;
}

async function curlSoap(alias, password, operation, body) {
  const directory = await mkdtemp(join(tmpdir(), 'gbeyan-ews-'));
  const soapPath = join(directory, 'request.xml');
  const soap = soapEnvelope(body);
  await writeFile(soapPath, soap, { encoding: 'utf8', mode: 0o600 });

  const domainUser = `${DOMAIN}\\\\${alias}`;
  const config = [
    `url = "${configValue(EWS_URL)}"`,
    'request = "POST"',
    'ntlm',
    `user = "${configValue(domainUser + ':' + password)}"`,
    'silent',
    'show-error',
    'fail-with-body',
    'connect-timeout = 12',
    'max-time = 60',
    `user-agent = "BeyanRender/1.8.3"`,
    'header = "Content-Type: text/xml; charset=utf-8"',
    'header = "Accept: text/xml"',
    `header = "SOAPAction: \\\"${MESSAGES_NS}/${operation}\\\""`,
    `data-binary = "@${configValue(soapPath)}"`
  ].join('\n') + '\n';

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('curl', ['--config', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on('data', chunk => stdout.push(chunk));
      child.stderr.on('data', chunk => stderr.push(chunk));
      child.on('error', error => reject(new Error(`EWS curl başlatılamadı: ${error.message}`)));
      child.on('close', code => {
        const output = Buffer.concat(stdout).toString('utf8');
        const errorText = Buffer.concat(stderr).toString('utf8').trim();
        if (code !== 0) {
          reject(new Error(`EWS curl hatası (${code}): ${errorText || output.slice(0, 500)}`));
          return;
        }
        resolve(output);
      });
      child.stdin.end(config);
    });

    const xml = String(result || '');
    if (!xml) throw new Error('EWS boş yanıt döndürdü.');
    const fault = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim();
    if (fault) throw new Error(`Exchange EWS hatası: ${fault.slice(0, 300)}`);

    const codes = [...xml.matchAll(/<[^:>]*:?ResponseCode[^>]*>([^<]+)<\/[^:>]*:?ResponseCode>/gi)]
      .map(match => match[1].trim())
      .filter(Boolean);
    const failed = codes.find(code => code !== 'NoError');
    if (failed) throw new Error(`Exchange EWS hatası: ${failed}`);
    return xml;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function emptyDeletedItems(alias, password) {
  const body =
    '<m:EmptyFolder DeleteType="HardDelete" DeleteSubFolders="false">' +
    '<m:FolderIds><t:DistinguishedFolderId Id="deleteditems" /></m:FolderIds>' +
    '</m:EmptyFolder>';
  await curlSoap(alias, password, 'EmptyFolder', body);
  return { ok: true };
}
