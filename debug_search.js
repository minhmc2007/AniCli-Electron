const crypto = require('crypto');
const ALLANIME_REFR = 'https://youtu-chan.com';
const ALLANIME_API = 'https://api.allanime.day/api';

function decrypt(tobeparsed) {
  try {
    const key = Buffer.from(crypto.createHash('sha256').update('Xot36i3lK3:v1').digest('hex'), 'hex');
    const buf = Buffer.from(tobeparsed, 'base64');
    const iv = Buffer.from(buf.subarray(1, 13).toString('hex') + '00000002', 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([decipher.update(buf.subarray(13, buf.length - 16)), decipher.final()]).toString('utf8');
  } catch (e) { return null; }
}

async function search(q) {
  const query = 'query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name thumbnail } } }';
  const vars = { search: { query: q, allowAdult: true, allowUnknown: true }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'ALL' };
  
  try {
    const res = await fetch(ALLANIME_API, {
        method: 'POST',
        headers: { 
            'Referer': ALLANIME_REFR, 
            'Content-Type': 'application/json', 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0' 
        },
        body: JSON.stringify({ query, variables: vars })
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { tobeparsed: text }; }
    
    let data = json.data;
    if (json.tobeparsed) data = JSON.parse(decrypt(json.tobeparsed));
    if (json.data && json.data.tobeparsed) data = JSON.parse(decrypt(json.data.tobeparsed));
    
    if (data && data.shows) {
        data.shows.edges.forEach(e => {
            console.log(`NAME: ${e.name}`);
            console.log(`THUMB: ${e.thumbnail}`);
        });
    } else {
        console.log(`FAILED FOR ${q}:`, text.substring(0, 500));
    }
  } catch (e) {
    console.error(`ERROR FOR ${q}:`, e.message);
  }
}

async function run() {
    await search('Necromancer');
    await search('Doupo');
}

run();
